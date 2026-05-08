import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";

// POST /api/upload-notes
// Accepts note images, creates an upload record in DB, and returns the images
// as base64 for in-memory OCR processing. No images are stored in Supabase Storage.
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const subject = formData.get("subject") as string;
    const lectureId = formData.get("lecture_id") as string;
    const files = formData.getAll("files") as File[];

    if (!subject) {
        return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!files || files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    try {
        // Convert files to base64 for in-memory OCR (no storage)
        const imageData: { mimeType: string; base64: string }[] = [];
        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            imageData.push({
                mimeType: file.type || "image/jpeg",
                base64: buffer.toString("base64"),
            });
        }

        // Create upload record in DB
        const insertData: Record<string, unknown> = {
            student_email: authData.email,
            student_id: authData.appUser.id,
            subject,
            file_id: JSON.stringify([]), // no Drive file IDs
            status: "pending",
            ocr_status: "pending",
        };

        if (lectureId) {
            insertData.lecture_id = lectureId;
        }

        const { data: uploadRecord, error: dbError } = await supabase
            .from("uploads")
            .insert(insertData)
            .select("id")
            .single();

        if (dbError) {
            console.error("DB insert error:", dbError);
            return NextResponse.json({ error: "Failed to create upload record" }, { status: 500 });
        }

        return NextResponse.json({
            uploadId: uploadRecord.id,
            imageData, // base64 images for OCR processing
            fileCount: files.length,
        });
    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}
