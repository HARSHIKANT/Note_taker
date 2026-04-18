import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// Guard: only Head Teachers of a specific institute can manage their own roster.
async function getHeadTeacherSession() {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || !session.isHeadTeacher || !session.instituteId) {
        return null;
    }
    return session;
}

// GET /api/roster — list all roster members for the head teacher's institute
export async function GET() {
    const session = await getHeadTeacherSession();
    if (!session) return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });

    const { data, error } = await supabase
        .from("institute_members")
        .select("id, email, role")
        .eq("institute_id", session.instituteId)
        .order("role", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ members: data ?? [] });
}

// POST /api/roster — add a new email/role to the roster
export async function POST(req: NextRequest) {
    const session = await getHeadTeacherSession();
    if (!session) return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });

    const { email, role } = await req.json();

    if (!email || !email.trim()) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!role || !["student", "teacher", "head_teacher"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Upsert — if email already exists in this institute, update their role
    const { data, error } = await supabase
        .from("institute_members")
        .upsert(
            { institute_id: session.instituteId, email: email.trim().toLowerCase(), role },
            { onConflict: "institute_id, email" }
        )
        .select("id, email, role")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If the user already exists in users table, sync their role + institute
    await supabase
        .from("users")
        .update({
            role: role === "head_teacher" ? "teacher" : role,
            institute_id: session.instituteId,
            is_head_teacher: role === "head_teacher",
        })
        .eq("email", email.trim().toLowerCase());

    return NextResponse.json({ member: data });
}

// PUT /api/roster — edit the role of an existing member
export async function PUT(req: NextRequest) {
    const session = await getHeadTeacherSession();
    if (!session) return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });

    const { id, role } = await req.json();

    if (!id) return NextResponse.json({ error: "Member ID required" }, { status: 400 });
    if (!role || !["student", "teacher", "head_teacher"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Fetch the member's email for user row sync
    const { data: member } = await supabase
        .from("institute_members")
        .select("email")
        .eq("id", id)
        .eq("institute_id", session.instituteId)
        .single();

    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const { error } = await supabase
        .from("institute_members")
        .update({ role })
        .eq("id", id)
        .eq("institute_id", session.instituteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync role to users table
    await supabase
        .from("users")
        .update({
            role: role === "head_teacher" ? "teacher" : role,
            is_head_teacher: role === "head_teacher",
        })
        .eq("email", member.email);

    return NextResponse.json({ success: true });
}

// DELETE /api/roster?id=... — remove a member from the roster
export async function DELETE(req: NextRequest) {
    const session = await getHeadTeacherSession();
    if (!session) return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Member ID required" }, { status: 400 });

    // 1) Fetch the member's email BEFORE deleting (needed for cascade revoke)
    const { data: member } = await supabase
        .from("institute_members")
        .select("email, role")
        .eq("id", id)
        .eq("institute_id", session.instituteId)
        .single();

    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    // 2) Delete from the roster
    const { error } = await supabase
        .from("institute_members")
        .delete()
        .eq("id", id)
        .eq("institute_id", session.instituteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 3) REVOKE ACCESS: nullify the user's role and institute binding in the users table.
    //    This means even if their JWT is still active, the next sign-in will see role=null
    //    and auth.ts will route them to <UnregisteredScreen />.
    await supabase
        .from("users")
        .update({
            role: null,
            institute_id: null,
            is_head_teacher: false,
            class: null,
            enrolled_courses: null,
            assigned_subjects: null,
        })
        .eq("email", member.email);

    return NextResponse.json({ success: true });
}
