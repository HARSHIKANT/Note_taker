import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ocrImageFromDrive, compareNotesWithLecture } from "@/lib/google-ai";
import type { ExtendedSession } from "@/lib/types";

// Helper: retry a function with delay on 429 errors
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    label = "API"
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const is429 =
                error.message?.includes("429") ||
                error.message?.includes("Too Many Requests") ||
                error.message?.includes("quota");

            if (is429 && attempt < maxRetries) {
                const waitSec = attempt * 20; // 20s, 40s, 60s
                console.log(`[${label}] Rate limited, waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached");
}

// POST /api/ocr
// Body: { upload_id: string, file_ids: string[], lecture_id: string }
export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { upload_id, file_ids, lecture_id } = body;

    if (!upload_id || !file_ids || !Array.isArray(file_ids) || file_ids.length === 0 || !lecture_id) {
        return NextResponse.json({ error: "Missing required fields or valid file array" }, { status: 400 });
    }

    // Mark as processing
    await supabase
        .from("uploads")
        .update({ ocr_status: "processing" })
        .eq("id", upload_id);

    try {
        // 1. OCR all images together (with retry on rate limit)
        const ocrText = await withRetry(
            () => ocrImageFromDrive(session.accessToken!, file_ids),
            3,
            "OCR"
        );

        if (!ocrText.trim()) {
            await supabase
                .from("uploads")
                .update({
                    ocr_status: "failed",
                    ai_feedback: "Could not extract text from the image. Please upload a clearer photo.",
                })
                .eq("id", upload_id);

            return NextResponse.json({ error: "No text found in image" }, { status: 400 });
        }

        // 2. Get lecture content
        const { data: lecture } = await supabase
            .from("lectures")
            .select("content")
            .eq("id", lecture_id)
            .single();

        if (!lecture) {
            return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
        }

        // 3. Compare with Gemini (with retry on rate limit)
        const matchResult = await withRetry(
            () => compareNotesWithLecture(ocrText, lecture.content),
            3,
            "Compare"
        );

        // 4. Save results
        await supabase
            .from("uploads")
            .update({
                ocr_text: ocrText,
                match_score: matchResult.score,
                ai_feedback: JSON.stringify(matchResult),
                ocr_status: "completed",
            })
            .eq("id", upload_id);

        return NextResponse.json({
            ocr_text: ocrText,
            match: matchResult,
        });
    } catch (error: any) {
        console.error("OCR pipeline error:", error);

        await supabase
            .from("uploads")
            .update({ ocr_status: "failed", ai_feedback: error.message })
            .eq("id", upload_id);

        return NextResponse.json(
            { error: error.message || "OCR processing failed" },
            { status: 500 }
        );
    }
}
