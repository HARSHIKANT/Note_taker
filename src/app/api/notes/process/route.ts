import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { ocrImageFromBase64, compareNotesWithLecture } from "@/lib/google-ai";
import { google } from "googleapis";
import { Readable } from "stream";

const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
                const waitSec = attempt * 20;
                console.log(`[${label}] Rate limited, waiting ${waitSec}s before retry ${attempt + 1}/${maxRetries}...`);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached");
}

// POST /api/notes/process
// Body: { filePaths: string[], lectureId: string, subject: string, alsoDrive: boolean }
// Downloads images from Supabase Storage, runs OCR, optionally uploads to Drive, then cleans up.
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const geminiApiKey = authData.appUser.gemini_api_key;
    if (!geminiApiKey) {
        return NextResponse.json(
            { error: "Gemini API key is required. Please add your key in Settings." },
            { status: 403 }
        );
    }

    const body = await req.json();
    const { filePaths, lectureId, subject, alsoDrive } = body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0 || !lectureId || !subject) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Create upload record in DB
    const insertData: Record<string, unknown> = {
        student_email: authData.email,
        student_id: authData.appUser.id,
        subject,
        lecture_id: lectureId,
        file_id: JSON.stringify([]),
        status: "pending",
        ocr_status: "processing",
    };

    const { data: uploadRecord, error: dbError } = await supabase
        .from("uploads")
        .insert(insertData)
        .select("id")
        .single();

    if (dbError || !uploadRecord) {
        console.error("DB insert error:", dbError);
        return NextResponse.json({ error: "Failed to create upload record" }, { status: 500 });
    }

    const uploadId = uploadRecord.id;

    try {
        // 2. Download all images from Supabase Storage
        console.log(`[Process] Downloading ${filePaths.length} images from Storage...`);
        const imageData: { mimeType: string; base64: string }[] = [];
        const imageBuffers: { buffer: Buffer; name: string; mimeType: string }[] = [];

        for (const fp of filePaths) {
            const { data: blob, error: dlError } = await adminSupabase.storage
                .from("notes")
                .download(fp);

            if (dlError || !blob) {
                console.error(`[Process] Failed to download ${fp}:`, dlError);
                continue;
            }

            const buffer = Buffer.from(await blob.arrayBuffer());
            const mimeType = blob.type || "image/jpeg";

            imageData.push({
                mimeType,
                base64: buffer.toString("base64"),
            });

            // Keep buffers for potential Drive upload
            imageBuffers.push({
                buffer,
                name: fp.split("/").pop() || "image.jpg",
                mimeType,
            });
        }

        if (imageData.length === 0) {
            await supabase
                .from("uploads")
                .update({ ocr_status: "failed", ai_feedback: "No images could be downloaded from storage" })
                .eq("id", uploadId);
            return NextResponse.json({ error: "Failed to download images" }, { status: 500 });
        }

        // 3. OCR all images together via Gemini
        console.log(`[Process] Running OCR on ${imageData.length} images...`);
        const ocrText = await withRetry(
            () => ocrImageFromBase64(imageData, geminiApiKey),
            3,
            "OCR"
        );

        if (!ocrText.trim()) {
            await supabase
                .from("uploads")
                .update({
                    ocr_status: "failed",
                    ai_feedback: "Could not extract text from the images. Please upload clearer photos.",
                })
                .eq("id", uploadId);
            return NextResponse.json({ error: "No text found in images" }, { status: 400 });
        }

        // 4. Get lecture content and compare
        const { data: lecture } = await supabase
            .from("lectures")
            .select("content")
            .eq("id", lectureId)
            .single();

        if (!lecture) {
            await supabase
                .from("uploads")
                .update({ ocr_status: "failed", ai_feedback: "Lecture not found" })
                .eq("id", uploadId);
            return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
        }

        console.log(`[Process] Comparing notes with lecture...`);
        const matchResult = await withRetry(
            () => compareNotesWithLecture(ocrText, lecture.content, geminiApiKey),
            3,
            "Compare"
        );

        // 5. Save all OCR results to uploads table
        const driveFileIds: string[] = [];

        // 6. Optionally upload to Google Drive
        if (alsoDrive) {
            const refreshToken = authData.appUser.google_refresh_token;
            if (refreshToken) {
                console.log(`[Process] Uploading ${imageBuffers.length} images to Google Drive...`);
                try {
                    const oauth2Client = new google.auth.OAuth2(
                        process.env.GOOGLE_CLIENT_ID,
                        process.env.GOOGLE_CLIENT_SECRET
                    );
                    oauth2Client.setCredentials({ refresh_token: refreshToken });
                    const drive = google.drive({ version: "v3", auth: oauth2Client });

                    for (const img of imageBuffers) {
                        const res = await drive.files.create({
                            requestBody: {
                                name: img.name,
                                mimeType: img.mimeType,
                            },
                            media: {
                                mimeType: img.mimeType,
                                body: Readable.from(img.buffer),
                            },
                            fields: "id",
                        });
                        if (res.data.id) {
                            driveFileIds.push(res.data.id);
                        }
                    }
                    console.log(`[Process] Uploaded ${driveFileIds.length} files to Drive`);
                } catch (driveErr: any) {
                    console.error("[Process] Drive upload failed:", driveErr.message);
                    // Drive failure is non-fatal — OCR results still save
                }
            }
        }

        // Save results
        await supabase
            .from("uploads")
            .update({
                ocr_text: ocrText,
                match_score: matchResult.score,
                ai_feedback: JSON.stringify(matchResult),
                ocr_status: "completed",
                ai_probability: matchResult.aiProbability || 0,
                human_probability: matchResult.humanProbability || 0,
                ai_explanation: matchResult.explanation || "N/A",
                file_id: JSON.stringify(driveFileIds),
                status: "completed",
            })
            .eq("id", uploadId);

        // 7. Recalculate lecture-level AI detection insights
        const { data: uploadsData } = await supabase
            .from("uploads")
            .select("match_score, ai_probability, ai_feedback")
            .eq("lecture_id", lectureId)
            .eq("ocr_status", "completed");

        if (uploadsData && uploadsData.length > 0) {
            const aiUploads = uploadsData.filter((u) => u.ai_probability !== null);
            if (aiUploads.length > 0) {
                let sumAI = 0;
                const aiDistribution = [
                    { range: "0-20%", count: 0 },
                    { range: "21-50%", count: 0 },
                    { range: "51-80%", count: 0 },
                    { range: "81-100%", count: 0 },
                ];

                for (const sub of aiUploads) {
                    const prob = sub.ai_probability || 0;
                    sumAI += prob;
                    if (prob <= 20) aiDistribution[0].count++;
                    else if (prob <= 50) aiDistribution[1].count++;
                    else if (prob <= 80) aiDistribution[2].count++;
                    else aiDistribution[3].count++;
                }

                await supabase
                    .from("lectures")
                    .update({
                        ai_detection_insights: {
                            averageAiProbability: sumAI / aiUploads.length,
                            distribution: aiDistribution,
                        },
                    })
                    .eq("id", lectureId);
            }
        }

        // 8. Delete images from Supabase Storage (cleanup)
        console.log(`[Process] Cleaning up ${filePaths.length} files from Storage...`);
        const { error: deleteError } = await adminSupabase.storage
            .from("notes")
            .remove(filePaths);

        if (deleteError) {
            console.error("[Process] Storage cleanup failed:", deleteError);
            // Non-fatal — orphan files are harmless
        } else {
            console.log("[Process] Storage cleanup complete");
        }

        return NextResponse.json({
            uploadId,
            ocrText,
            match: matchResult,
            driveFileCount: driveFileIds.length,
        });
    } catch (error: any) {
        console.error("Process pipeline error:", error);

        await supabase
            .from("uploads")
            .update({ ocr_status: "failed", ai_feedback: error.message })
            .eq("id", uploadId);

        // Attempt cleanup even on error
        try {
            await adminSupabase.storage.from("notes").remove(filePaths);
        } catch {
            // ignore cleanup errors
        }

        return NextResponse.json(
            { error: error.message || "Processing failed" },
            { status: 500 }
        );
    }
}
