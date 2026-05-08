import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// GET /api/lectures?subject=Physics&class=10  (traditional)
// GET /api/lectures?course_id=<uuid>           (new course-based flow)
// - Teacher: returns ALL their lectures for that subject or course
// - Student: returns only PUBLISHED lectures matching their class+subject or course
export async function GET(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { appUser } = authData;

    const { searchParams } = new URL(req.url);
    const subject = searchParams.get("subject");
    const classFilter = searchParams.get("class");
    const courseId = searchParams.get("course_id");

    // — Course-based path —
    if (courseId) {
        if (appUser.role === "teacher") {
            let query = supabase
                .from("lectures")
                .select("*")
                .eq("teacher_id", appUser.id)
                .eq("course_id", courseId)
                .order("created_at", { ascending: false });
            if (appUser.institute_id) query = query.eq("institute_id", appUser.institute_id);
            const { data, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ lectures: data });
        }

        // Student — only published
        let query = supabase
            .from("lectures")
            .select("id, title, subject, class, course_id, published, created_at")
            .eq("course_id", courseId)
            .eq("published", true)
            .order("created_at", { ascending: false });
        if (appUser.institute_id) query = query.eq("institute_id", appUser.institute_id);
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ lectures: data });
    }

    // — Traditional subject+class path —
    if (!subject) {
        return NextResponse.json({ error: "subject or course_id required" }, { status: 400 });
    }

    if (appUser.role === "teacher") {
        let query = supabase
            .from("lectures")
            .select("*")
            .eq("teacher_id", appUser.id)
            .eq("subject", subject)
            .order("created_at", { ascending: false });

        if (classFilter) query = query.eq("class", classFilter);
        if (appUser.institute_id) query = query.eq("institute_id", appUser.institute_id);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ lectures: data });
    }

    // Student: only published lectures for their class
    const studentClass = appUser.class;
    if (!studentClass) {
        return NextResponse.json({ error: "Class not set" }, { status: 400 });
    }

    let studentQuery = supabase
        .from("lectures")
        .select("id, title, subject, class, published, created_at")
        .eq("subject", subject)
        .eq("class", studentClass)
        .eq("published", true)
        .order("created_at", { ascending: false });
    if (appUser.institute_id) studentQuery = studentQuery.eq("institute_id", appUser.institute_id);
    const { data, error } = await studentQuery;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lectures: data });
}

// POST /api/lectures — create a new lecture (teacher only)
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData || authData.appUser.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { appUser } = authData;

    const body = await req.json();
    const { title, subject, class: targetClass, content, recording_file_id, audio_insights, course_id } = body;

    if (!title || !content) {
        return NextResponse.json({ error: "Missing required fields: title, content" }, { status: 400 });
    }

    // Must have either class+subject OR course_id
    if (!course_id && (!subject || !targetClass)) {
        return NextResponse.json({ error: "Provide either class+subject or course_id" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("lectures")
        .insert({
            teacher_id: appUser.id,
            title,
            subject: subject || null,
            class: targetClass || null,
            course_id: course_id || null,
            content,
            recording_file_id: recording_file_id || null,
            audio_insights: audio_insights || null,
            published: false,
            institute_id: appUser.institute_id ?? null,
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lecture: data });
}

// PATCH /api/lectures — publish/unpublish or update
export async function PATCH(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData || authData.appUser.role !== "teacher") {
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
        .eq("teacher_id", authData.appUser.id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lecture: data });
}

// DELETE /api/lectures?id=...
export async function DELETE(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData || authData.appUser.role !== "teacher") {
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
        .eq("teacher_id", authData.appUser.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
