import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// GET /api/submissions/insights?lecture_id=...
// Fetches the pre-computed insights and last generated timestamp from the lectures table.
export async function GET(req: NextRequest) {
    const authData = await getAuthUser();
    const session = authData ? { userId: authData.appUser.id, role: authData.appUser.role, isHeadTeacher: authData.appUser.is_head_teacher, instituteId: authData.appUser.institute_id, geminiApiKey: authData.appUser.gemini_api_key, accessToken: "present", user: { email: authData.email } } : null;
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
