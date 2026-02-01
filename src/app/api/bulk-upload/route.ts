
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase";
import { Readable } from "stream";

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
        name: name,
        mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
        fileMetadata.parents = [parentId];
    }
    try {
        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: "id",
        });
        return file.data.id;
    } catch (error) {
        console.error(`Error creating folder ${name}:`, error);
        throw error;
    }
}

export async function POST(req: NextRequest) {
    // 1. Authentication Check
    const session = await auth() as (import("next-auth").Session & { accessToken?: string }) | null;
    if (!session?.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!ownerEmail) {
        console.error("OWNER_EMAIL is missing in env variables");
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // 2. Parse Form Data
    let formData;
    try {
        formData = await req.formData();
    } catch (e) {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const subject = formData.get("subject") as string;
    const files = formData.getAll("files") as File[]; // Expecting field name 'files'

    if (!subject) {
        return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }
    if (!files || files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // 3. Initialize Drive Client
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: authClient });

    try {
        // 4. Resolve Folder Structure (Once for the whole batch)
        let notesFolderId = await findFolder(drive, "Notes");
        if (!notesFolderId) {
            notesFolderId = await createFolder(drive, "Notes");
        }

        let subjectFolderId = await findFolder(drive, subject, notesFolderId);
        if (!subjectFolderId) {
            subjectFolderId = await createFolder(drive, subject, notesFolderId);
        }

        // 5. Process Files
        const results = await Promise.all(
            files.map(async (file) => {
                try {
                    if (!file || typeof file.arrayBuffer !== 'function') {
                        return { name: "unknown", status: "failed", error: "Invalid file object" };
                    }

                    // Buffer & Stream
                    const buffer = Buffer.from(await file.arrayBuffer());
                    const stream = Readable.from(buffer);

                    const fileMetadata = {
                        name: file.name,
                        parents: [subjectFolderId],
                    };
                    const media = {
                        mimeType: file.type,
                        body: stream,
                    };

                    // A. Upload to Drive
                    const uploadResponse = await drive.files.create({
                        requestBody: fileMetadata,
                        media: media,
                        fields: "id",
                    });
                    const fileId = uploadResponse.data.id!;

                    // B. Share with Owner
                    await drive.permissions.create({
                        fileId: fileId,
                        requestBody: {
                            role: "reader",
                            type: "user",
                            emailAddress: ownerEmail,
                        },
                    });

                    // C. Log to Supabase
                    const { error: dbError } = await supabase.from("uploads").insert({
                        student_email: session.user?.email,
                        subject: subject,
                        file_id: fileId,
                        status: "pending",
                    });

                    if (dbError) {
                        console.error(`Supabase error for ${file.name}:`, dbError);
                        // We don't mark as failed if only DB logging fails, but it's good to note
                    }

                    return { name: file.name, status: "success", fileId };

                } catch (err: any) {
                    console.error(`Failed to upload ${file.name}:`, err);
                    return { name: file.name, status: "failed", error: err.message };
                }
            })
        );

        // 6. Return Summary
        const successful = results.filter(r => r.status === "success");
        const failed = results.filter(r => r.status === "failed");

        return NextResponse.json({
            message: `Processed ${files.length} files`,
            successCount: successful.length,
            failCount: failed.length,
            results
        });

    } catch (error: any) {
        console.error("Bulk upload critical error:", error);
        return NextResponse.json({ error: error.message || "Bulk upload failed" }, { status: 500 });
    }
}
