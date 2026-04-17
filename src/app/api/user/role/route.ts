import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { CLASSES, SUBJECTS } from "@/lib/types";
import type { ExtendedSession } from "@/lib/types";

export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { class: userClass, enrolled_courses, assigned_subjects } = body;

    // Role is now pre-assigned by the roster — validate it exists
    if (!session.role) {
        return NextResponse.json({ error: "Your email is not registered with any institute. Ask your Head Teacher to add you." }, { status: 403 });
    }

    // Validate student curriculum fields
    if (session.role === "student") {
        const hasClass = userClass && CLASSES.includes(userClass);
        const hasCourses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0;

        // Students must select at least one (class OR courses, or both)
        if (!hasClass && !hasCourses) {
            return NextResponse.json(
                { error: "Please select a class or at least one course" },
                { status: 400 }
            );
        }
        // NOTE: class + courses simultaneously is now ALLOWED — no blocking validation
    }

    // Validate teacher subject/course selections
    if (session.role === "teacher") {
        const hasSubjects = Array.isArray(assigned_subjects) && assigned_subjects.length > 0;
        const hasCourses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0;

        if (!hasSubjects && !hasCourses) {
            return NextResponse.json(
                { error: "Please select at least one subject or course to teach" },
                { status: 400 }
            );
        }

        // Validate subjects against known list
        if (hasSubjects) {
            const invalid = assigned_subjects.filter((s: string) => !SUBJECTS.includes(s as any));
            if (invalid.length > 0) {
                return NextResponse.json({ error: `Invalid subjects: ${invalid.join(", ")}` }, { status: 400 });
            }
        }
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};

    if (session.role === "student") {
        updateData.class = userClass || null;
        updateData.enrolled_courses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0
            ? enrolled_courses
            : null;
    }

    if (session.role === "teacher") {
        updateData.assigned_subjects = Array.isArray(assigned_subjects) && assigned_subjects.length > 0
            ? assigned_subjects
            : null;
        updateData.enrolled_courses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0
            ? enrolled_courses
            : null;
    }

    const { error } = await supabase
        .from("users")
        .update(updateData)
        .eq("email", session.user.email);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
