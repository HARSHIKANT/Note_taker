import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/submissions?lecture_id=...
// Teacher only: get all student submissions for a lecture
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

    // Verify this lecture belongs to the teacher and fetch its AI detection insights
    const { data: lecture } = await supabase
        .from("lectures")
        .select("id, ai_detection_insights")
        .eq("id", lectureId)
        .eq("teacher_id", session.userId)
        .single();

    if (!lecture) {
        return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
    }

    // Get submissions with student info — exclude failed uploads/OCR (only shown to students)
    const { data, error } = await supabase
        .from("uploads")
        .select("id, student_email, file_id, ocr_text, match_score, ai_feedback, ocr_status, ai_probability, human_probability, ai_explanation, created_at, student_id")
        .eq("lecture_id", lectureId)
        .neq("ocr_status", "failed")
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch student names
    const studentIds = [...new Set(data?.map((d) => d.student_id).filter(Boolean))];
    let students: Record<string, { name: string; email: string }> = {};

    if (studentIds.length > 0) {
        const { data: users } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", studentIds);

        if (users) {
            students = Object.fromEntries(
                users.map((u) => [u.id, { name: u.name || u.email, email: u.email }])
            );
        }
    }

    const submissions = data?.map((d) => ({
        ...d,
        student_name: d.student_id ? students[d.student_id]?.name : d.student_email,
    }));

    return NextResponse.json({ submissions, ai_detection_insights: lecture.ai_detection_insights });
}
