import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { transcribeRecording } from "@/lib/google-ai";
import type { ExtendedSession } from "@/lib/types";

// POST /api/lectures/transcribe
// Body: { fileId: string, mimeType: string }
export async function POST(req: NextRequest) {
  const session = (await auth()) as ExtendedSession | null;
  if (!session?.accessToken || session.role !== "teacher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { fileId, mimeType } = body;

  if (!fileId || !mimeType) {
    return NextResponse.json({ error: "fileId and mimeType required" }, { status: 400 });
  }

  try {
    const transcript = await transcribeRecording(
      session.accessToken,
      fileId,
      mimeType
    );

    return NextResponse.json({ transcript });
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
