import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { callWithModelFallback } from "@/lib/google-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtendedSession } from "@/lib/types";

// POST /api/lectures/generate-insights
// Body: { lecture_id: string }
// Uses the teacher's own Gemini API key to aggregate class-wide missing topics.
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.accessToken || session.role !== "teacher") {
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
    const { lecture_id } = body;

    if (!lecture_id) {
        return NextResponse.json({ error: "lecture_id is required" }, { status: 400 });
    }

    // Fetch lecture title and all completed uploads for this lecture
    const [lectureRes, uploadsRes] = await Promise.all([
        supabase.from("lectures").select("title").eq("id", lecture_id).single(),
        supabase
            .from("uploads")
            .select("match_score, ai_feedback")
            .eq("lecture_id", lecture_id)
            .eq("ocr_status", "completed"),
    ]);

    const lecture = lectureRes.data;
    const uploads = uploadsRes.data;

    if (!lecture) {
        return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
    }

    if (!uploads || uploads.length === 0) {
        return NextResponse.json({ error: "No completed student submissions found for this lecture." }, { status: 400 });
    }

    // Aggregate all missing topics and compute average score from current submissions
    let totalScore = 0;
    let scoredCount = 0;
    const scoreDistribution = [
        { range: "0-40%", count: 0 },
        { range: "41-60%", count: 0 },
        { range: "61-80%", count: 0 },
        { range: "81-100%", count: 0 },
    ];
    const allMissingTopics: string[] = [];

    for (const upload of uploads) {
        if (upload.match_score !== null) {
            const score = upload.match_score || 0;
            totalScore += score;
            scoredCount++;
            if (score <= 40) scoreDistribution[0].count++;
            else if (score <= 60) scoreDistribution[1].count++;
            else if (score <= 80) scoreDistribution[2].count++;
            else scoreDistribution[3].count++;
        }

        if (upload.ai_feedback) {
            try {
                const fb = typeof upload.ai_feedback === "string"
                    ? JSON.parse(upload.ai_feedback)
                    : upload.ai_feedback;
                if (fb.missing && Array.isArray(fb.missing)) {
                    allMissingTopics.push(...fb.missing);
                }
            } catch { }
        }
    }

    const averageScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

    // Call Gemini to aggregate missing topics — uses the teacher's own API key
    let missedConceptsSummary = "No significant concepts were missed by the class.";
    let missingTopicsList: string[] = [];

    if (allMissingTopics.length > 0) {
        const prompt = `You are an AI teaching assistant analyzing class performance.
Here is a raw list of topics that various students missed in their notes for the lecture "${lecture.title}":
${JSON.stringify(allMissingTopics)}

Your task:
1. Aggregate and group identical or highly similar concepts.
2. Identify the most commonly missed concepts across the class.
3. Return a JSON object with:
   - "summary": A short, 1-2 sentence paragraph summarizing the main knowledge gaps for the teacher.
   - "top_missed": An array of strings representing the top 3 to 5 most frequently missed consolidated concepts.

Return ONLY valid JSON. Nothing else.`;

        try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const insightRaw = await callWithModelFallback("Insights", async (modelName) => {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
                });
                const result = await model.generateContent(prompt);
                return result.response.text();
            });

            if (insightRaw) {
                const cleaned = insightRaw.replace(/```json\n?|\n?```/g, "").trim();
                const parsed = JSON.parse(cleaned);
                if (parsed.summary) missedConceptsSummary = parsed.summary;
                if (parsed.top_missed) missingTopicsList = parsed.top_missed;
            }
        } catch (err) {
            console.error("[generate-insights] Gemini call failed:", err);
            missedConceptsSummary = "Failed to generate AI insights. Please try again.";
        }
    }

    const insights = {
        averageScore,
        scoreDistribution,
        missedConceptsSummary,
        missingTopicsList,
    };

    // Save to lectures table
    const { error: updateError } = await supabase
        .from("lectures")
        .update({
            insights,
            insights_last_generated_at: new Date().toISOString(),
        })
        .eq("id", lecture_id);

    if (updateError) {
        console.error("[generate-insights] Failed to save insights:", updateError);
        return NextResponse.json({ error: "Failed to save insights." }, { status: 500 });
    }

    console.log(`[generate-insights] Saved insights for lecture ${lecture_id} (${uploads.length} submissions).`);
    return NextResponse.json({ insights, insights_last_generated_at: new Date().toISOString() });
}
