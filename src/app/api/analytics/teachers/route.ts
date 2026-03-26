import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { ExtendedSession } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/analytics/teachers
// - Head Teacher: returns all teachers' audio insights
// - Regular Teacher: returns only their own
export async function GET(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        let query = adminSupabase
            .from("lectures")
            .select("id, title, subject, class, teacher_id, created_at, audio_insights")
            .not("audio_insights", "is", null)
            .order("created_at", { ascending: false });

        // Head teachers see all lectures; regular teachers only see their own
        if (!session.isHeadTeacher) {
            query = query.eq("teacher_id", session.userId);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // For head teachers, join with teacher name from users table
        if (session.isHeadTeacher && data) {
            const teacherIds = [...new Set(data.map((l) => l.teacher_id))];
            const { data: users } = await adminSupabase
                .from("users")
                .select("id, name, email")
                .in("id", teacherIds);

            const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
            const enriched = data.map((lecture) => ({
                ...lecture,
                teacher: userMap[lecture.teacher_id] || null,
            }));
            return NextResponse.json({ lectures: enriched });
        }

        return NextResponse.json({ lectures: data });
    } catch (error: any) {
        console.error("[Analytics] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
