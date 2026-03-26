import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import type { ExtendedSession } from "@/lib/types";

// POST /api/lectures/upload-audio
// Accepts: multipart FormData with field "file"
// Returns: { filePath: string }
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service role key to bypass RLS
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "");
    const fileName = `${Date.now()}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await adminSupabase.storage
        .from("recordings")
        .upload(fileName, buffer, { contentType: file.type, upsert: true });

    if (error) {
        console.error("[Upload Audio] Supabase error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filePath: data.path });
}
