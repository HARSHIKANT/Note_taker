import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/user/me — returns fresh user profile from DB (bypasses JWT cache)
export async function GET() {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user, error } = await supabase
        .from("users")
        .select("role, class, enrolled_courses, assigned_subjects, is_head_teacher")
        .eq("email", session.user.email)
        .single();

    if (error || !user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
        role: user.role,
        class: user.class,
        enrolledCourses: user.enrolled_courses ?? null,
        assignedSubjects: user.assigned_subjects ?? null,
        isHeadTeacher: user.is_head_teacher ?? false,
    });
}
