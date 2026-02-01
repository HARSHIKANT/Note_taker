
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase";
import { Readable } from "stream";

export async function POST(req: NextRequest) {
    const session = await auth() as (import("next-auth").Session & { accessToken?: string }) | null;
    if (!session?.accessToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const subject = formData.get("subject") as string;
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!file || !subject || !ownerEmail) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth: authClient });

    try {
        // 1. Find or Create "Notes" folder in root
        // Note: We don't specify parent for "Notes", so it goes to root.
        let notesFolderId = await findFolder(drive, "Notes");
        if (!notesFolderId) {
            notesFolderId = await createFolder(drive, "Notes");
        }

        // 2. Find or Create Subject folder inside Notes
        let subjectFolderId = await findFolder(drive, subject, notesFolderId);
        if (!subjectFolderId) {
            subjectFolderId = await createFolder(drive, subject, notesFolderId);
        }

        // 3. Upload File
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

        const uploadResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id, webViewLink",
        });

        const fileId = uploadResponse.data.id!;

        // 4. Share with Owner (Permission Grant)
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: "reader",
                type: "user",
                emailAddress: ownerEmail,
            },
        });

        // 5. Save Metadata to Supabase
        // If supabase fails, we log it but don't fail the whole request
        // since the file is safely in Drive.
        try {
            const { error: dbError } = await supabase.from("uploads").insert({
                student_email: session.user?.email,
                subject: subject,
                file_id: fileId,
                status: "pending",
            });

            //supabase saves a file id which you can convert into link by pasting file_id here https://drive.google.com/file/d/{file_id}/view
            if (dbError) console.error("Supabase Insert Error:", dbError);
        } catch (dbErr) {
            console.error("Supabase Exception:", dbErr);
        }

        return NextResponse.json({ success: true, fileId });

    } catch (error: any) {
        console.error("Upload process failed:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}

// Helper: Find folder by name and parent
async function findFolder(drive: any, name: string, parentId?: string) {
    // Escaping single quotes in name is important if names have quotes, 
    // but for subjects like "Physics" it's fine.
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const res = await drive.files.list({
        q: query,
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }
    return null;
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
    const file = await drive.files.create({
        requestBody: fileMetadata,
        fields: "id",
    });
    return file.data.id;
}
