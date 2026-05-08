import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// GET /api/courses — returns all available courses for the current user's institute
export async function GET() {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
        .from("courses")
        .select("id, name, created_at")
        .order("created_at", { ascending: true });

    if (authData.appUser.institute_id) {
        query = query.eq("institute_id", authData.appUser.institute_id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ courses: data ?? [] });
}

// POST /api/courses — Head Teacher creates a new course
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData || !authData.appUser.is_head_teacher) {
        return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
        return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("courses")
        .insert({ name: name.trim(), created_by: authData.appUser.id, institute_id: authData.appUser.institute_id ?? null })
        .select("id, name, created_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data });
}

// DELETE /api/courses?id=...
export async function DELETE(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData || !authData.appUser.is_head_teacher) {
        return NextResponse.json({ error: "Head Teacher access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
