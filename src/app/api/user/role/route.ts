import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { CLASSES } from "@/lib/types";
import type { ExtendedSession } from "@/lib/types";

export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { role, class: userClass, enrolled_courses } = body;

    // Validate role
    if (!role || !["student", "teacher"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Students must provide EITHER a class OR enrolled courses — not both
    if (role === "student") {
        const hasClass = userClass && CLASSES.includes(userClass);
        const hasCourses = Array.isArray(enrolled_courses) && enrolled_courses.length > 0;

        if (!hasClass && !hasCourses) {
            return NextResponse.json(
                { error: "Please select a class or at least one course" },
                { status: 400 }
            );
        }

        if (hasClass && hasCourses) {
            return NextResponse.json(
                { error: "Cannot select both a class and courses" },
                { status: 400 }
            );
        }
    }

    // Only allow setting role if not already set
    const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("email", session.user.email)
        .single();

    if (user?.role) {
        return NextResponse.json({ error: "Role already set" }, { status: 400 });
    }

    // Build update payload
    const updateData: { role: string; class?: string | null; enrolled_courses?: string[] | null } = { role };
    if (role === "student") {
        if (userClass) {
            updateData.class = userClass;
            updateData.enrolled_courses = null;
        } else {
            updateData.class = null;
            updateData.enrolled_courses = enrolled_courses;
        }
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
