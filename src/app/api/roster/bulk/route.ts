import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// Guard: only Head Teachers
async function getHeadTeacherSession() {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || !session.isHeadTeacher || !session.instituteId) return null;
    return session;
}

// POST /api/roster/bulk — upsert an entire array of { email, role } at once
export async function POST(req: NextRequest) {
    const session = await getHeadTeacherSession();
    if (!session) return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });

    const { members } = await req.json() as { members: { email: string; role: string }[] };

    if (!Array.isArray(members) || members.length === 0) {
        return NextResponse.json({ error: "No valid members provided" }, { status: 400 });
    }

    // Validate all entries before touching the DB
    const VALID_ROLES = ["student", "teacher", "head_teacher"];
    const invalid = members.filter(
        (m) => !m.email?.includes("@") || !VALID_ROLES.includes(m.role)
    );
    if (invalid.length > 0) {
        return NextResponse.json(
            { error: `${invalid.length} entries have invalid email or role`, invalid },
            { status: 400 }
        );
    }

    // 1) Bulk upsert into institute_members (single DB round trip)
    const rows = members.map((m) => ({
        institute_id: session.instituteId,
        email: m.email.trim().toLowerCase(),
        role: m.role,
    }));

    const { error: upsertError } = await supabase
        .from("institute_members")
        .upsert(rows, { onConflict: "institute_id, email" });

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    // 2) Sync existing users — update role + institute for anyone already in the users table
    //    Do per-email updates since Supabase doesn't support batch update with different values per row
    const syncResults = await Promise.allSettled(
        members.map((m) =>
            supabase
                .from("users")
                .update({
                    role: m.role === "head_teacher" ? "teacher" : m.role,
                    institute_id: session.instituteId,
                    is_head_teacher: m.role === "head_teacher",
                })
                .eq("email", m.email.trim().toLowerCase())
        )
    );

    const syncErrors = syncResults.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
        success: true,
        inserted: members.length,
        syncErrors, // non-fatal — existing users who couldn't be synced
    });
}
