import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";
import { CLASSES, SUBJECTS } from "@/lib/types";

export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { appUser } = authData;

    const body = await req.json();
    const { class: userClass, enrolled_courses, assigned_subjects } = body;

    // Role is now pre-assigned by the roster — validate it exists
    if (!appUser.role) {
        return NextResponse.json({ error: "Your email is not registered with any institute. Ask your Head Teacher to add you." }, { status: 403 });
    }

    // Validate student curriculum fields
    if (appUser.role === "student") {
        const hasClass = userClass && CLASSES.includes(userClass);
        const hasCourses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0;

        if (!hasClass && !hasCourses) {
            return NextResponse.json(
                { error: "Please select a class or at least one course" },
                { status: 400 }
            );
        }
    }

    // Validate teacher subject/course selections
    if (appUser.role === "teacher") {
        const hasSubjects = Array.isArray(assigned_subjects) && assigned_subjects.length > 0;
        const hasCourses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0;

        if (!hasSubjects && !hasCourses) {
            return NextResponse.json(
                { error: "Please select at least one subject or course to teach" },
                { status: 400 }
            );
        }

        if (hasSubjects) {
            const invalid = assigned_subjects.filter((s: string) => !SUBJECTS.includes(s as any));
            if (invalid.length > 0) {
                return NextResponse.json({ error: `Invalid subjects: ${invalid.join(", ")}` }, { status: 400 });
            }
        }
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};

    if (appUser.role === "student") {
        updateData.class = userClass || null;
        updateData.enrolled_courses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0
            ? enrolled_courses
            : null;
    }

    if (appUser.role === "teacher") {
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
        .eq("email", authData.email);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
