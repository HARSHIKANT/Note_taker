import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

// ── Helper: Download file from Drive as Buffer ──────────────────────
async function downloadFromDrive(
    accessToken: string,
    fileId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: authClient });

    // Get file metadata
    const metaRes = await drive.files.get({
        fileId,
        fields: "mimeType, name",
    });
    const origMimeType = metaRes.data.mimeType || "image/jpeg";

    const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
    );

    // Handle different response types from googleapis
    let buffer: Buffer;
    if (res.data instanceof ArrayBuffer) {
        buffer = Buffer.from(res.data);
    } else if (Buffer.isBuffer(res.data)) {
        buffer = res.data;
    } else if (typeof res.data === "string") {
        buffer = Buffer.from(res.data, "binary");
    } else {
        const chunks: Buffer[] = [];
        const stream = res.data as NodeJS.ReadableStream;
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
    }

    if (!buffer || buffer.length === 0) {
        throw new Error("Failed to download file from Drive — empty file");
    }

    console.log(`[Drive] Downloaded ${fileId}, size: ${buffer.length} bytes, mimeType: ${origMimeType}`);

    // Compress large images for OCR (Cloud Vision limit ~10MB for base64)
    const isImage = origMimeType.startsWith("image/");
    if (isImage && buffer.length > 2 * 1024 * 1024) {
        console.log(`[Drive] Image is ${(buffer.length / 1024 / 1024).toFixed(1)}MB, compressing...`);
        buffer = await sharp(buffer)
            .resize(1600, null, { withoutEnlargement: true }) // max 1600px wide
            .jpeg({ quality: 80 })
            .toBuffer();
        console.log(`[Drive] Compressed to ${(buffer.length / 1024 / 1024).toFixed(1)}MB JPEG`);
        return { buffer, mimeType: "image/jpeg" };
    }

    return { buffer, mimeType: origMimeType };
}

// ── OCR: Gemini 2.5 Flash (Primary) ──────────────────────────────────
export async function ocrImageFromDrive(
    accessToken: string,
    fileIds: string[]
): Promise<string> {
    console.log(`[OCR] Using Gemini 2.5 Flash for OCR on ${fileIds.length} images...`);

    // Download all images in parallel
    const downloads = await Promise.all(
        fileIds.map((id) => downloadFromDrive(accessToken, id))
    );

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });mperature: 0 });

    // Build the parts array for Gemini, containing all images
    const parts: any[] = downloads.map((d) => ({
        inlineData: { mimeType: d.mimeType, data: d.buffer.toString("base64") },
    }));

    // Add the prompt instruction
    parts.push({
        text: "Extract ALL text from these images of handwritten notes. Organize and structure the extracted text logically (e.g., using headings, bullet points, and appropriate formatting based on the layout of the notes). Combine the text from all pages cohesively. Output ONLY the structured text content, nothing else. If no text is found, respond with exactly: NO_TEXT_FOUND",
    });

    const result = await model.generateContent(parts);

    const extractedText = result.response.text().trim();
    console.log(`[OCR] Gemini extracted structured text length: ${extractedText.length} chars`);

    return extractedText === "NO_TEXT_FOUND" ? "" : extractedText;
}

// ── Gemini: Transcribe audio/video ────────────────────────────────────
export async function transcribeRecording(
    accessToken: string,
    fileId: string,
    mimeType: string
): Promise<string> {
    // 1. Download recording from Drive
    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: authClient });

    const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(res.data as ArrayBuffer);
    const base64 = buffer.toString("base64");

    // 2. Send to Gemini for transcription
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", temperature: 0 });

    const result = await model.generateContent([
        {
            inlineData: {
                mimeType: mimeType,
                data: base64,
            },
        },
        {
            text: "Transcribe this audio/video lecture recording into text. Output ONLY the transcript — no timestamps, no speaker labels, no formatting. Just the spoken words as plain text.",
        },
    ]);

    return result.response.text();
}

// ── Gemini: Compare student notes vs lecture ───────────────────────────
export interface MatchResult {
    score: number; // 0-100
    feedback: string;
    covered: string[];
    missing: string[];
    aiProbability?: number;
    humanProbability?: number;
    explanation?: string;
}

export async function compareNotesWithLecture(
    ocrText: string,
    lectureContent: string
): Promise<MatchResult> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", temperature: 0 });

    const prompt = `You are a strict educational AI assistant and forensic text analyzer. You have two distinct tasks:

TASK 1: Note Comparison
Compare a student's handwritten notes (extracted via OCR) with the teacher's lecture transcript.
Analyze how well the student's notes cover the key concepts from the lecture.

TASK 2: Aggressive AI Detection
Determine if the student's notes appear AI-generated (e.g. ChatGPT, Claude) or authentically human-written. 
WARNING: Many students use AI to generate fake notes. You must be extremely strict and skeptical.
- AI Signs (HIGH AI PROBABILITY > 80%): Flawless formatting, perfect grammar, highly structured bullet points, using words like "delve", "furthermore", "in conclusion", robotic/uniform sentence lengths, lack of personal shorthand or abbreviations, feeling "too perfect" or synthetic.
- Human Signs (HIGH HUMAN PROBABILITY): Typos, messy logical leaps, heavy use of abbreviations (e.g., "b/c", "w/"), informal arrows/symbols, incomplete thoughts, rambling.
If the text reads like a perfectly structured textbook summary rather than messy personal student notes, score it high for AI.

LECTURE TRANSCRIPT:
"""
${lectureContent}
"""

STUDENT'S NOTES (OCR):
"""
${ocrText}
"""

Return a JSON object with the following fields depending on the analysis of BOTH tasks:
- "score": number from 0 to 100 representing percentage of key concepts covered
- "feedback": one paragraph summary of the student's note quality
- "covered": array of key topics the student captured well
- "missing": array of important topics the student missed
- "aiProbability": number from 0 to 100 representing the probability that the text is AI-generated
- "humanProbability": number from 0 to 100 representing the probability that the text is human-written
- "explanation": a crisp, to-the-point explanation (less than 10 words) of why it was flagged as AI or human.

Return ONLY valid JSON, nothing else.`;

    const result = await model.generateContent(prompt);mperature here if supported
    const responseText = result.response.text();

    // Parse JSON from response (strip markdown code fences if present)
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();

    try {
        return JSON.parse(cleaned) as MatchResult;
    } catch {
        return {
            score: 0,
            feedback: "Could not analyze notes. Please try again.",
            covered: [],
            missing: [],
            aiProbability: 0,
            humanProbability: 0,
            explanation: "Analysis failed",
        };
    }
}
