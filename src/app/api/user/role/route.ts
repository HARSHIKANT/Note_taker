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
    const { role, class: userClass } = body;

    // Validate role
    if (!role || !["student", "teacher"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Students must provide a class
    if (role === "student") {
        if (!userClass || !CLASSES.includes(userClass)) {
            return NextResponse.json(
                { error: "Invalid class. Must be 5-10" },
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
        return NextResponse.json(
            { error: "Role already set" },
            { status: 400 }
        );
    }

    // Update user
    const updateData: { role: string; class?: string } = { role };
    if (role === "student") {
        updateData.class = userClass;
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
