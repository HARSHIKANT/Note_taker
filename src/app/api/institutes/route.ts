import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// POST /api/institutes — Register a new institute (called from /register-institute page)
// The authed user becomes the head_teacher of the new institute.
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { appUser } = authData;

    // Prevent a user from creating a second institute if they already belong to one
    if (appUser.institute_id) {
        return NextResponse.json({ error: "You already belong to an institute" }, { status: 400 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
        return NextResponse.json({ error: "Institute name is required" }, { status: 400 });
    }

    // Create the institute
    const { data: institute, error: instituteError } = await supabase
        .from("institutes")
        .insert({ name: name.trim() })
        .select("id, name")
        .single();

    if (instituteError || !institute) {
        return NextResponse.json({ error: instituteError?.message ?? "Failed to create institute" }, { status: 500 });
    }

    // Add the creator to the roster as head_teacher
    await supabase.from("institute_members").insert({
        institute_id: institute.id,
        email: authData.email,
        role: "head_teacher",
    });

    // Update the user row: set institute_id, role=teacher, is_head_teacher=true
    const { error: userError } = await supabase
        .from("users")
        .update({
            institute_id: institute.id,
            role: "teacher",
            is_head_teacher: true,
        })
        .eq("id", appUser.id);

    if (userError) {
        return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    return NextResponse.json({ institute });
}
