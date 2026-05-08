import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// GET /api/student-uploads?lecture_id=...
// Returns the current student's uploads for a specific lecture
export async function GET(req: NextRequest) {
    const authData = await getAuthUser();
    const session = authData ? { userId: authData.appUser.id, role: authData.appUser.role, isHeadTeacher: authData.appUser.is_head_teacher, instituteId: authData.appUser.institute_id, geminiApiKey: authData.appUser.gemini_api_key, accessToken: "present", user: { email: authData.email } } : null;
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
