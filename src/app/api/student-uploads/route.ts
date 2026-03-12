import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/student-uploads?lecture_id=...
// Returns the current student's uploads for a specific lecture
export async function GET(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lecture_id");

    if (!lectureId) {
        return NextResponse.json({ error: "lecture_id required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("uploads")
        .select("id, file_id, lecture_id, ocr_text, match_score, ai_feedback, ocr_status, created_at")
        .eq("student_id", session.userId)
        .eq("lecture_id", lectureId)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ uploads: data });
}
