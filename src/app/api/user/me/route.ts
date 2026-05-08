import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabase } from "@/lib/supabase";

// GET /api/user/me — returns fresh user profile from DB (bypasses cache)
export async function GET() {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: dbUser, error } = await supabase
        .from("users")
        .select("id, name, avatar_url, role, class, enrolled_courses, assigned_subjects, is_head_teacher, gemini_api_key, institute_id, google_refresh_token")
        .eq("email", user.email)
        .single();

    if (error || !dbUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch institute name if applicable
    let instituteName: string | null = null;
    if (dbUser.institute_id) {
        const { data: inst } = await supabase
            .from("institutes")
            .select("name")
            .eq("id", dbUser.institute_id)
            .single();
        instituteName = inst?.name ?? null;
    }

    return NextResponse.json({
        id: dbUser.id,
        name: dbUser.name,
        avatar_url: dbUser.avatar_url,
        role: dbUser.role,
        class: dbUser.class,
        enrolledCourses: dbUser.enrolled_courses ?? null,
        assignedSubjects: dbUser.assigned_subjects ?? null,
        isHeadTeacher: dbUser.is_head_teacher ?? false,
        geminiApiKey: dbUser.gemini_api_key ?? null,
        instituteId: dbUser.institute_id ?? null,
        instituteName,
        googleRefreshToken: dbUser.google_refresh_token ? "present" : null,
    });
}
