import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// GET /api/notes — fetch all notes for the current student
export async function GET() {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
        .from("notes")
        .select("id, title, content, created_at, updated_at")
        .eq("user_id", authData.authId)
        .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notes: data ?? [] });
}

// POST /api/notes — create a new note
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, content } = body;

    const { data, error } = await supabase
        .from("notes")
        .insert({
            user_id: authData.authId,
            title: title ?? "",
            content: content ?? "",
        })
        .select("id, title, content, created_at, updated_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ note: data });
}

// PATCH /api/notes — update a note
export async function PATCH(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, title, content } = body;

    if (!id) return NextResponse.json({ error: "Note ID required" }, { status: 400 });

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;

    const { data, error } = await supabase
        .from("notes")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", authData.authId)
        .select("id, title, content, created_at, updated_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ note: data });
}

// DELETE /api/notes?id=...
export async function DELETE(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Note ID required" }, { status: 400 });

    const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", id)
        .eq("user_id", authData.authId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
