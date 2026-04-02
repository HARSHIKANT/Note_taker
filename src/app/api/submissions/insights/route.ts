import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/submissions/insights?lecture_id=...
// Fetches the pre-computed insights and last generated timestamp from the lectures table.
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

    const { data: lecture, error } = await supabase
        .from("lectures")
        .select("insights, insights_last_generated_at")
        .eq("id", lectureId)
        .eq("teacher_id", session.userId)
        .single();

    if (error || !lecture) {
        return NextResponse.json({ error: "Lecture not found or no access" }, { status: 404 });
    }

    return NextResponse.json({
        insights: lecture.insights ?? null,
        insights_last_generated_at: lecture.insights_last_generated_at ?? null,
    });
}
