import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// PATCH /api/user/settings
// Body: { geminiApiKey: string }
export async function PATCH(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
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
        .eq("id", authData.appUser.id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
