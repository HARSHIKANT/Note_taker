import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/courses — returns all available courses for the current user's institute
export async function GET() {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
        .from("courses")
        .select("id, name, created_at")
        .order("created_at", { ascending: true });

    // Scope to institute if one is set
    if (session.instituteId) {
        query = query.eq("institute_id", session.instituteId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ courses: data ?? [] });
}

// POST /api/courses — Head Teacher creates a new course
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || !session.isHeadTeacher) {
        return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
        return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("courses")
        .insert({ name: name.trim(), created_by: session.userId, institute_id: session.instituteId ?? null })
        .select("id, name, created_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data });
}

// DELETE /api/courses?id=...
export async function DELETE(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || !session.isHeadTeacher) {
        return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
