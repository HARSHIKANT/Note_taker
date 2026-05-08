import { createClient } from "@/lib/supabase/server";
import { supabase } from "@/lib/supabase";
import type { AppUser } from "@/lib/types";

/**
 * Server-side auth helper for API routes.
 * Returns the authenticated Supabase user AND the app user profile from public.users.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<{
    authId: string;
    email: string;
    appUser: AppUser;
} | null> {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user?.email) return null;

    const { data: dbUser } = await supabase
        .from("users")
        .select("id, email, name, avatar_url, role, class, is_head_teacher, gemini_api_key, enrolled_courses, institute_id, assigned_subjects, google_refresh_token")
        .eq("email", user.email)
        .single();

    if (!dbUser) return null;

    return {
        authId: user.id,
        email: user.email,
        appUser: {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            avatar_url: dbUser.avatar_url,
            role: dbUser.role,
            class: dbUser.class,
            is_head_teacher: dbUser.is_head_teacher ?? false,
            gemini_api_key: dbUser.gemini_api_key ?? null,
            enrolled_courses: dbUser.enrolled_courses ?? null,
            institute_id: dbUser.institute_id ?? null,
            assigned_subjects: dbUser.assigned_subjects ?? null,
            google_refresh_token: dbUser.google_refresh_token ?? null,
        },
    };
}
