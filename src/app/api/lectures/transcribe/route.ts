import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transcribeRecordingFromSupabase } from "@/lib/google-ai";
import type { ExtendedSession } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/lectures/transcribe
// Body: { filePath: string, mimeType: string, lectureId?: string }
export async function POST(req: NextRequest) {
  const session = (await auth()) as ExtendedSession | null;
  if (!session?.accessToken || session.role !== "teacher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { filePath, mimeType, lectureId } = body;

  if (!filePath || !mimeType) {
    return NextResponse.json({ error: "filePath and mimeType required" }, { status: 400 });
  }

  try {
    const result = await transcribeRecordingFromSupabase(filePath, mimeType);

    // Clean up Supabase recording after transcription
    await adminSupabase.storage.from("recordings").remove([filePath]);

    // Persist audio_insights to the lecture record if lectureId is available
    if (lectureId) {
      await adminSupabase
        .from("lectures")
        .update({ audio_insights: result.insights })
        .eq("id", lectureId);
      console.log(`[Transcription] Saved audio_insights for lecture ${lectureId}`);
    }

    return NextResponse.json({
      transcript: result.transcript,
      insights: result.insights,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
