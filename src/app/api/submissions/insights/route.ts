import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/submissions/insights?lecture_id=...
// Fetches the pre-computed insights from the lectures table
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

    // Fetch the lecture and its cached insights
    const { data: lecture, error } = await supabase
        .from("lectures")
        .select("insights")
        .eq("id", lectureId)
        .eq("teacher_id", session.userId)
        .single();

    if (error || !lecture) {
        return NextResponse.json({ error: "Lecture not found or no access" }, { status: 404 });
    }

    // Default empty state if no insights have been generated yet
    const emptyState = {
        averageScore: 0,
        scoreDistribution: [],
        missedConceptsSummary: "No completed submissions yet.",
        missingTopicsList: []
    };

    return NextResponse.json(lecture.insights || emptyState);
}
