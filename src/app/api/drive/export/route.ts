import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-helpers";
import { supabase } from "@/lib/supabase";
import { google } from "googleapis";

// POST /api/drive/export
// Body: { noteId: string }
// Exports a note as a Google Doc in the user's Drive
export async function POST(req: NextRequest) {
    const authData = await getAuthUser();
    if (!authData) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const refreshToken = authData.appUser.google_refresh_token;
    if (!refreshToken) {
        return NextResponse.json(
            { error: "Google Drive not connected. Sign in with Google to enable this feature." },
            { status: 403 }
        );
    }

    const body = await req.json();
    const { noteId } = body;

    if (!noteId) {
        return NextResponse.json({ error: "noteId is required" }, { status: 400 });
    }

    // Fetch the note (verify ownership)
    const { data: note, error: noteError } = await supabase
        .from("notes")
        .select("id, title, content")
        .eq("id", noteId)
        .eq("user_id", authData.authId)
        .single();

    if (noteError || !note) {
        return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    try {
        // Create OAuth2 client with refresh token
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        const docs = google.docs({ version: "v1", auth: oauth2Client });

        // Create a Google Doc
        const doc = await docs.documents.create({
            requestBody: {
                title: note.title || "Untitled Note",
            },
        });

        const docId = doc.data.documentId!;

        // Insert content into the doc
        if (note.content) {
            await docs.documents.batchUpdate({
                documentId: docId,
                requestBody: {
                    requests: [
                        {
                            insertText: {
                                location: { index: 1 },
                                text: note.content,
                            },
                        },
                    ],
                },
            });
        }

        const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

        return NextResponse.json({
            success: true,
            docUrl,
            docId,
        });
    } catch (error: any) {
        console.error("Drive export error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to export to Google Drive" },
            { status: 500 }
        );
    }
}
