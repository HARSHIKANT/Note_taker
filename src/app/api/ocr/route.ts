import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ocrImageFromDrive, compareNotesWithLecture, callWithModelFallback } from "@/lib/google-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtendedSession } from "@/lib/types";

// Helper: retry a function with delay on 429 errors
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    label = "API"
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const is429 =
                error.message?.includes("429") ||
                error.message?.includes("Too Many Requests") ||
                error.message?.includes("quota");

            if (is429 && attempt < maxRetries) {
                const waitSec = attempt * 20; // 20s, 40s, 60s
                console.log(`[${label}] Rate limited, waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached");
}

// POST /api/ocr
// Body: { upload_id: string, file_ids: string[], lecture_id: string }
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { upload_id, file_ids, lecture_id } = body;

    if (!upload_id || !file_ids || !Array.isArray(file_ids) || file_ids.length === 0 || !lecture_id) {
        return NextResponse.json({ error: "Missing required fields or valid file array" }, { status: 400 });
    }

    // Mark as processing
    await supabase
        .from("uploads")
        .update({ ocr_status: "processing" })
        .eq("id", upload_id);

    try {
        // 1. OCR all images together (with retry on rate limit)
        const ocrText = await withRetry(
            () => ocrImageFromDrive(session.accessToken!, file_ids),
            3,
            "OCR"
        );

        if (!ocrText.trim()) {
            await supabase
                .from("uploads")
                .update({
                    ocr_status: "failed",
                    ai_feedback: "Could not extract text from the image. Please upload a clearer photo.",
                })
                .eq("id", upload_id);

            return NextResponse.json({ error: "No text found in image" }, { status: 400 });
        }

        // 2. Get lecture content
        const { data: lecture } = await supabase
            .from("lectures")
            .select("content")
            .eq("id", lecture_id)
            .single();

        if (!lecture) {
            return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
        }

        // 3. Compare with Gemini (with retry on rate limit)
        const matchResult = await withRetry(
            () => compareNotesWithLecture(ocrText, lecture.content),
            3,
            "Compare"
        );

        // 4. Save results to the current upload
        await supabase
            .from("uploads")
            .update({
                ocr_text: ocrText,
                match_score: matchResult.score,
                ai_feedback: JSON.stringify(matchResult),
                ocr_status: "completed",
                ai_probability: matchResult.aiProbability || 0,
                human_probability: matchResult.humanProbability || 0,
                ai_explanation: matchResult.explanation || "N/A"
            })
            .eq("id", upload_id);

        // 5. Recalculate and update average AI probability and Insights for the lecture
        const { data: uploadsData } = await supabase
            .from("uploads")
            .select("match_score, ai_probability, ai_feedback")
            .eq("lecture_id", lecture_id)
            .eq("ocr_status", "completed");

        let aiDetectionInsights: any = null;
        let insights = null;

        if (uploadsData && uploadsData.length > 0) {
            // A) AI Detection Insights
            const aiUploads = uploadsData.filter(u => u.ai_probability !== null);
            if (aiUploads.length > 0) {
                let sumAI = 0;
                const aiDistribution = [
                    { range: "0-20%", count: 0 },
                    { range: "21-50%", count: 0 },
                    { range: "51-80%", count: 0 },
                    { range: "81-100%", count: 0 },
                ];

                for (const sub of aiUploads) {
                    const prob = sub.ai_probability || 0;
                    sumAI += prob;

                    if (prob <= 20) aiDistribution[0].count++;
                    else if (prob <= 50) aiDistribution[1].count++;
                    else if (prob <= 80) aiDistribution[2].count++;
                    else aiDistribution[3].count++;
                }

                const averageAiProbability = sumAI / aiUploads.length;
                aiDetectionInsights = {
                    averageAiProbability,
                    distribution: aiDistribution
                };
            }

            // B) Insights Engine
            const scoredUploads = uploadsData.filter(u => u.match_score !== null);
            if (scoredUploads.length > 0) {
                let totalScore = 0;
                const distribution = [
                    { range: "0-40%", count: 0 },
                    { range: "41-60%", count: 0 },
                    { range: "61-80%", count: 0 },
                    { range: "81-100%", count: 0 },
                ];
                const allMissingTopics: string[] = [];

                for (const sub of scoredUploads) {
                    const score = sub.match_score || 0;
                    totalScore += score;

                    if (score <= 40) distribution[0].count++;
                    else if (score <= 60) distribution[1].count++;
                    else if (score <= 80) distribution[2].count++;
                    else distribution[3].count++;

                    if (sub.ai_feedback) {
                        try {
                            const fb = typeof sub.ai_feedback === 'string' ? JSON.parse(sub.ai_feedback) : sub.ai_feedback;
                            if (fb.missing && Array.isArray(fb.missing)) {
                                allMissingTopics.push(...fb.missing);
                            }
                        } catch { }
                    }
                }

                const averageScore = Math.round(totalScore / scoredUploads.length);
                let missedConceptsSummary = "No significant concepts were missed by the class.";
                let aggregatedMissingList: string[] = [];

                if (allMissingTopics.length > 0) {
                    try {
                        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

                        // Get lecture title for better context
                        const { data: lec } = await supabase
                            .from("lectures")
                            .select("title")
                            .eq("id", lecture_id)
                            .single();

                        const prompt = `You are an AI teaching assistant analyzing class performance. 
Here is a raw list of topics that various students missed in their notes for the lecture "${lec?.title || "Unknown"}":
${JSON.stringify(allMissingTopics)}

Your task:
1. Aggregate and group identical or highly similar concepts.
2. Identify the most commonly missed concepts across the class.
3. Return a JSON object with:
   - "summary": A short, 1-2 sentence paragraph summarizing the main knowledge gaps for the teacher.
   - "top_missed": An array of strings representing the top 3 to 5 most frequently missed consolidated concepts.

Return ONLY valid JSON. Nothing else.`;

                        // Model fallback: primary → gemini-3-flash → gemini-3.1-flash-lite (with round-based waits)
                        const insightRaw = await callWithModelFallback("Insights", async (modelName) => {
                            const model = genAI.getGenerativeModel({ model: modelName });
                            const result = await model.generateContent(prompt);
                            return result.response.text();
                        });

                        if (insightRaw) {
                            const cleaned = insightRaw.replace(/```json\n?|\n?```/g, "").trim();
                            const parsed = JSON.parse(cleaned);
                            if (parsed.summary) missedConceptsSummary = parsed.summary;
                            if (parsed.top_missed) aggregatedMissingList = parsed.top_missed;
                        }
                    } catch (err) {
                        console.error("Failed to aggregate insights via AI:", err);
                        missedConceptsSummary = "Failed to load AI insights.";
                    }
                }

                insights = {
                    averageScore,
                    scoreDistribution: distribution,
                    missedConceptsSummary,
                    missingTopicsList: aggregatedMissingList
                };
            }

            // Update both aggregate JSON blobs on the lecture
            const updatePayload: any = {};
            if (aiDetectionInsights) {
                updatePayload.ai_detection_insights = aiDetectionInsights;
            }
            if (insights) {
                updatePayload.insights = insights;
            }

            if (Object.keys(updatePayload).length > 0) {
                await supabase
                    .from("lectures")
                    .update(updatePayload)
                    .eq("id", lecture_id);
            }
        }

        return NextResponse.json({
            ocr_text: ocrText,
            match: matchResult,
        });
    } catch (error: any) {
        console.error("OCR pipeline error:", error);

        await supabase
            .from("uploads")
            .update({ ocr_status: "failed", ai_feedback: error.message })
            .eq("id", upload_id);

        return NextResponse.json(
            { error: error.message || "OCR processing failed" },
            { status: 500 }
        );
    }
}
