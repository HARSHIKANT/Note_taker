import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// POST /api/notes/upload-url
// Body: { files: [{ fileName: string, mimeType: string }] }
// Returns signed URLs for direct browser → Supabase Storage upload.
// File payload NEVER passes through this Vercel function.
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const files: { fileName: string; mimeType: string }[] = body.files;

    if (!files || !Array.isArray(files) || files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Use service role key to generate signed upload URLs (bypasses RLS)
    const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // One unique ID per submission — groups all pages of one note together
    const uploadUuid = randomUUID();
    const studentId = authData.appUser.id;

    const uploads: { signedUrl: string; filePath: string; token: string }[] = [];

    for (const file of files) {
        const safeName = file.fileName.replace(/[^a-zA-Z0-9.\-_]/g, "");
        const filePath = `${studentId}/${uploadUuid}/${Date.now()}_${safeName}`;

        const { data, error } = await adminSupabase.storage
            .from("notes")
            .createSignedUploadUrl(filePath);

        if (error || !data) {
            console.error("[Upload URL] Failed:", error);
            return NextResponse.json(
                { error: error?.message || "Failed to create upload URL" },
                { status: 500 }
            );
        }

        uploads.push({
            signedUrl: data.signedUrl,
            filePath,
            token: data.token,
        });
    }

    return NextResponse.json({ uploads, uploadUuid });
}
