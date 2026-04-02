import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ocrImageFromDrive, compareNotesWithLecture } from "@/lib/google-ai";
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

    if (!session.geminiApiKey) {
        return NextResponse.json(
            { error: "Gemini API key is required. Please add your key in Settings." },
            { status: 403 }
        );
    }

    const geminiApiKey = session.geminiApiKey;

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
            () => ocrImageFromDrive(session.accessToken!, file_ids, geminiApiKey),
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
            () => compareNotesWithLecture(ocrText, lecture.content, geminiApiKey),
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

        // ── Section A: AI Detection Stats (pure math, no Gemini call) ──────────────
        // Class-wide missing topics aggregation (Insights) is intentionally NOT done here.
        // It is triggered on-demand by the teacher via POST /api/lectures/generate-insights.
        let aiDetectionInsights: any = null;

        if (uploadsData && uploadsData.length > 0) {
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

                aiDetectionInsights = {
                    averageAiProbability: sumAI / aiUploads.length,
                    distribution: aiDistribution
                };
            }

            if (aiDetectionInsights) {
                await supabase
                    .from("lectures")
                    .update({ ai_detection_insights: aiDetectionInsights })
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
