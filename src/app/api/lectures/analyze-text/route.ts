import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { analyzeTranscriptText } from "@/lib/google-ai";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/lectures/analyze-text
// Body: { transcript: string, lectureId?: string }
// Called automatically after publishing — runs in background, no user wait
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    const session = authData ? { userId: authData.appUser.id, role: authData.appUser.role, isHeadTeacher: authData.appUser.is_head_teacher, instituteId: authData.appUser.institute_id, geminiApiKey: authData.appUser.gemini_api_key, accessToken: "present", user: { email: authData.email } } : null;
    if (!session?.userId || session.role !== "teacher") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!session.geminiApiKey) {
        return NextResponse.json(
            { error: "Gemini API key is required. Please add your key in Settings." },
            { status: 403 }
        );
    }

    const geminiApiKey = session.geminiApiKey;

    const { transcript, lectureId } = await req.json();

    if (!transcript || transcript.trim().length < 50) {
        return NextResponse.json(
            { error: "Transcript too short to analyse." },
            { status: 400 }
        );
    }

    try {
        const insights = await analyzeTranscriptText(transcript, geminiApiKey);

        // If lectureId given, persist insights back to the lecture record
        if (lectureId) {
            const { error } = await adminSupabase
                .from("lectures")
                .update({ audio_insights: insights })
                .eq("id", lectureId);

            if (error) {
                console.error("[analyze-text] Failed to save insights:", error);
            } else {
                console.log(`[analyze-text] Saved insights for lecture ${lectureId}`);
            }
        }

        return NextResponse.json({ insights });
    } catch (error: any) {
        console.error("[analyze-text] Error:", error);
        return NextResponse.json({ error: error.message || "Analysis failed" }, { status: 500 });
    }
}
