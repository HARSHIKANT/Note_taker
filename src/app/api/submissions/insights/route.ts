import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

// GET /api/submissions/insights?lecture_id=...
// Fetches all submissions for a lecture, aggregates scores, and uses Gemini to summarize missed concepts
export async function GET(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lecture_id");

    if (!lectureId) {
        return NextResponse.json({ error: "lecture_id required" }, { status: 400 });
    }

    // Verify this lecture belongs to the teacher
    const { data: lecture } = await supabase
        .from("lectures")
        .select("id, title")
        .eq("id", lectureId)
        .eq("teacher_id", session.userId)
        .single();

    if (!lecture) {
        return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
    }

    // Get submissions
    const { data: submissions, error } = await supabase
        .from("uploads")
        .select("match_score, ai_feedback")
        .eq("lecture_id", lectureId)
        .not("match_score", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!submissions || submissions.length === 0) {
        return NextResponse.json({
            averageScore: 0,
            scoreDistribution: [],
            missedConceptsSummary: "No completed submissions yet.",
            missingTopicsList: []
        });
    }

    // Calculate Average Score and Distribution
    let totalScore = 0;
    const distribution = [
        { range: "0-40%", count: 0 },
        { range: "41-60%", count: 0 },
        { range: "61-80%", count: 0 },
        { range: "81-100%", count: 0 },
    ];

    const allMissingTopics: string[] = [];

    for (const sub of submissions) {
        const score = sub.match_score || 0;
        totalScore += score;

        if (score <= 40) distribution[0].count++;
        else if (score <= 60) distribution[1].count++;
        else if (score <= 80) distribution[2].count++;
        else distribution[3].count++;

        if (sub.ai_feedback) {
            try {
                const fb = JSON.parse(sub.ai_feedback);
                if (fb.missing && Array.isArray(fb.missing)) {
                    allMissingTopics.push(...fb.missing);
                }
            } catch { }
        }
    }

    const averageScore = Math.round(totalScore / submissions.length);

    let missedConceptsSummary = "No significant concepts were missed by the class.";
    let aggregatedMissingList: string[] = [];

    // Use Gemini to aggregate the missing topics if there are any
    if (allMissingTopics.length > 0) {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
            const parsed = JSON.parse(cleaned);

            if (parsed.summary) missedConceptsSummary = parsed.summary;
            if (parsed.top_missed) aggregatedMissingList = parsed.top_missed;
        } catch (err: any) {
            console.error("Failed to aggregate insights with Gemini:", err);
            missedConceptsSummary = "Failed to load AI insights.";
        }
    }

    return NextResponse.json({
        averageScore,
        scoreDistribution: distribution,
        missedConceptsSummary,
        missingTopicsList: aggregatedMissingList
    });
}
