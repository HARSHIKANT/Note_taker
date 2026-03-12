import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// GET /api/lectures?subject=Physics&class=10
// - Teacher: returns ALL their lectures for that subject (optionally filtered by class)
// - Student: returns only PUBLISHED lectures for their class + subject
export async function GET(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject");
    const classFilter = searchParams.get("class");

    if (!subject) {
        return NextResponse.json({ error: "Subject required" }, { status: 400 });
    }

    if (session.role === "teacher") {
        let query = supabase
            .from("lectures")
            .select("*")
            .eq("teacher_id", session.userId)
            .eq("subject", subject)
            .order("created_at", { ascending: false });

        if (classFilter) {
            query = query.eq("class", classFilter);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ lectures: data });
    }

    // Student: only published lectures for their class
    const studentClass = session.class;
    if (!studentClass) {
        return NextResponse.json({ error: "Class not set" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("lectures")
        .select("id, title, subject, class, published, created_at")
        .eq("subject", subject)
        .eq("class", studentClass)
        .eq("published", true)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lectures: data });
}

// POST /api/lectures — create a new lecture (teacher only)
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, subject, class: targetClass, content, recording_file_id } = body;

    if (!title || !subject || !targetClass || !content) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("lectures")
        .insert({
            teacher_id: session.userId,
            title,
            subject,
            class: targetClass,
            content,
            recording_file_id: recording_file_id || null,
            published: false,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lecture: data });
}

// PATCH /api/lectures — publish/unpublish or update
export async function PATCH(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, published, title, content } = body;

    if (!id) {
        return NextResponse.json({ error: "Lecture ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof published === "boolean") updateData.published = published;
    if (title) updateData.title = title;
    if (content) updateData.content = content;

    const { data, error } = await supabase
        .from("lectures")
        .update(updateData)
        .eq("id", id)
        .eq("teacher_id", session.userId)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lecture: data });
}

// DELETE /api/lectures?id=...
export async function DELETE(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Lecture ID required" }, { status: 400 });
    }

    const { error } = await supabase
        .from("lectures")
        .delete()
        .eq("id", id)
        .eq("teacher_id", session.userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
