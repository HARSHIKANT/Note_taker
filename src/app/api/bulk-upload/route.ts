import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase";
import { Readable } from "stream";
import type { ExtendedSession } from "@/lib/types";

// Helper: Find folder by name and parent
async function findFolder(drive: any, name: string, parentId?: string) {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }
    try {
        const res = await drive.files.list({
            q: query,
            fields: "files(id, name)",
            spaces: "drive",
        });
        if (res.data.files && res.data.files.length > 0) {
            return res.data.files[0].id;
        }
        return null;
    } catch (error) {
        console.error(`Error finding folder ${name}:`, error);
        return null;
    }
}

// Helper: Create folder
async function createFolder(drive: any, name: string, parentId?: string) {
    const fileMetadata: any = {
        name,
        mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
        fileMetadata.parents = [parentId];
    }
    const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: "id",
    });
    return file.data.id;
}

export async function POST(req: NextRequest) {
    const session = (await auth()) as ExtendedSession | null;
    if (!session?.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!ownerEmail) {
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    let formData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const subject = formData.get("subject") as string;
    const lectureId = formData.get("lecture_id") as string;
    const files = formData.getAll("files") as File[];

    if (!subject) {
        return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!files || files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: authClient });

    try {
        // Get lecture title for folder name
        let lectureTitle = "General Notes";
        if (lectureId) {
            const { data: lecture } = await supabase
                .from("lectures")
                .select("title")
                .eq("id", lectureId)
                .single();
            if (lecture) lectureTitle = lecture.title;
        }

        // Resolve folder structure
        let notesFolderId = await findFolder(drive, "Notes");
        if (!notesFolderId) {
            notesFolderId = await createFolder(drive, "Notes");
        }

        let subjectFolderId = await findFolder(drive, subject, notesFolderId);
        if (!subjectFolderId) {
            subjectFolderId = await createFolder(drive, subject, notesFolderId);
        }

        let lectureFolderId = await findFolder(drive, lectureTitle, subjectFolderId);
        if (!lectureFolderId) {
            lectureFolderId = await createFolder(drive, lectureTitle, subjectFolderId);
        }

        const results = await Promise.all(
            files.map(async (file) => {
                try {
                    if (!file || typeof file.arrayBuffer !== "function") {
                        return { name: "unknown", status: "failed", error: "Invalid file object" };
                    }

                    const buffer = Buffer.from(await file.arrayBuffer());
                    const stream = Readable.from(buffer);

                    const fileMetadata = {
                        name: file.name,
                        parents: [lectureFolderId],
                    };
                    const media = {
                        mimeType: file.type,
                        body: stream,
                    };

                    const uploadResponse = await drive.files.create({
                        requestBody: fileMetadata,
                        media,
                        fields: "id",
                    });
                    const fileId = uploadResponse.data.id!;

                    // Share with owner
                    await drive.permissions.create({
                        fileId,
                        requestBody: {
                            role: "reader",
                            type: "user",
                            emailAddress: ownerEmail,
                        },
                    });

                    return {
                        name: file.name,
                        status: "success",
                        fileId,
                    };
                } catch (err: any) {
                    console.error(`Failed to upload ${file.name}:`, err);
                    return { name: file.name, status: "failed", error: err.message };
                }
            })
        );

        const successful = results.filter((r) => r.status === "success");
        const failed = results.filter((r) => r.status === "failed");

        if (successful.length === 0) {
            return NextResponse.json({ error: "All uploads failed" }, { status: 500 });
        }

        const fileIds = successful.map((r) => r.fileId);

        // Log to Supabase with new fields (ONE row for entire batch)
        const insertData: Record<string, unknown> = {
            student_email: session.user?.email,
            student_id: session.userId || null,
            subject,
            file_id: JSON.stringify(fileIds), // array mapping
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
            console.error("Supabase error for batch insert:", dbError);
        }

        return NextResponse.json({
            message: `Processed ${files.length} files`,
            successCount: successful.length,
            failCount: failed.length,
            uploadId: uploadRecord?.id,
            fileIds,
            results,
        });
    } catch (error: any) {
        console.error("Bulk upload error:", error);
        return NextResponse.json({ error: error.message || "Bulk upload failed" }, { status: 500 });
    }
}
