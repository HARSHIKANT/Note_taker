
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase";
import { Readable } from "stream";

async function getGoogleAuthClient(refreshToken: string) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    // This will automatically refresh the access token
    return oauth2Client;
}

export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const refreshToken = authData.appUser.google_refresh_token;
    if (!refreshToken) {
        return NextResponse.json({ error: "Google Drive not connected. Sign in with Google to enable Drive uploads." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const subject = formData.get("subject") as string;
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!file || !subject || !ownerEmail) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const authClient = await getGoogleAuthClient(refreshToken);
    const drive = google.drive({ version: "v3", auth: authClient });

    try {
        // 1. Find or Create "Notes" folder in root
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
        try {
            const { error: dbError } = await supabase.from("uploads").insert({
                student_email: authData.email,
                subject: subject,
                file_id: fileId,
                status: "pending",
            });

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
