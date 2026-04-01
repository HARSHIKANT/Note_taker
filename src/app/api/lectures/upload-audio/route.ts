import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import type { ExtendedSession } from "@/lib/types";

// POST /api/lectures/upload-audio
// Body: { fileName: string, mimeType: string }
// Returns: { signedUrl: string, filePath: string }
// The client uses the signedUrl to PUT the file directly to Supabase Storage —
// the file payload NEVER passes through this Vercel function.
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { fileName, mimeType } = body;

    if (!fileName || !mimeType) {
        return NextResponse.json({ error: "Missing fileName or mimeType" }, { status: 400 });
    }

    // Use service role key to generate a signed upload URL bypassing RLS
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "");
    const filePath = `${Date.now()}_${safeName}`;

    // Create a signed URL valid for 5 minutes (300s) for a direct browser upload
    const { data, error } = await adminSupabase.storage
        .from("recordings")
        .createSignedUploadUrl(filePath);

    if (error || !data) {
        console.error("[Upload Audio] Failed to create signed URL:", error);
        return NextResponse.json({ error: error?.message || "Failed to create upload URL" }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, filePath, token: data.token });
}
