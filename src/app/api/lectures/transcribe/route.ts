import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadRecordingToFileManager } from "@/lib/google-ai";
import { createClient } from "@supabase/supabase-js";
import type { ExtendedSession } from "@/lib/types";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/lectures/transcribe
// Body: { filePath: string, mimeType: string }
// Returns: { fileUri, fileName, fileMimeType }
//
// This route ONLY uploads the audio file from Supabase → Google AI File Manager.
// It does NOT call generateContent (which would timeout on Vercel free tier).
// The client (browser) handles the actual chunked transcription loop directly via the Gemini SDK.
export async function POST(req: NextRequest) {
  const session = (await auth()) as ExtendedSession | null;
  if (!session?.accessToken || session.role !== "teacher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.geminiApiKey) {
    return NextResponse.json(
      { error: "Gemini API key is required. Please add your key in Settings." },
      { status: 403 }
    );
  }

  const geminiApiKey = session.geminiApiKey;
  const body = await req.json();
  const { filePath, mimeType } = body;

  if (!filePath || !mimeType) {
    return NextResponse.json({ error: "filePath and mimeType required" }, { status: 400 });
  }

  try {
    const result = await uploadRecordingToFileManager(filePath, mimeType, geminiApiKey);

    // Schedule Supabase recording cleanup — the client will call this after all chunks done
    // We delete AFTER: keeping it here would delete before chunks are generated
    // (cleanup is now triggered explicitly by DELETE /api/lectures/transcribe)

    return NextResponse.json(result); // { fileUri, fileName, fileMimeType }
  } catch (error: any) {
    console.error("[Upload to File Manager] Error:", error);
    return NextResponse.json({ error: error.message || "File Manager upload failed" }, { status: 500 });
  }
}

// DELETE /api/lectures/transcribe
// Body: { filePath: string, geminiFileName: string }
// Called by the client after all chunks are successfully transcribed.
// Cleans up the recordings from both Supabase storage and Google AI File Manager.
export async function DELETE(req: NextRequest) {
  const session = (await auth()) as ExtendedSession | null;
  if (!session?.accessToken || session.role !== "teacher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { filePath, geminiFileName } = body;

  try {
    // Delete from Supabase storage
    if (filePath) {
      await adminSupabase.storage.from("recordings").remove([filePath]);
      console.log(`[Cleanup] Deleted ${filePath} from Supabase.`);
    }

    // Delete from Google AI File Manager using the Gemini Files API directly
    if (geminiFileName && session.geminiApiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}`,
        { method: "DELETE", headers: { "x-goog-api-key": session.geminiApiKey } }
      );
      if (res.ok) console.log(`[Cleanup] Deleted ${geminiFileName} from Gemini File Manager.`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
