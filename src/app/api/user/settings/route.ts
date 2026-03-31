import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { ExtendedSession } from "@/lib/types";

// PATCH /api/user/settings
// Body: { geminiApiKey: string }
export async function PATCH(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { geminiApiKey } = body;

    if (typeof geminiApiKey !== "string") {
        return NextResponse.json({ error: "geminiApiKey must be a string" }, { status: 400 });
    }

    const { error } = await supabase
        .from("users")
        .update({ gemini_api_key: geminiApiKey.trim() || null })
        .eq("id", session.userId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
