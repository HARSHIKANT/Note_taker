import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { supabase } from "@/lib/supabase";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0 }
    });

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

// ── Types: Audio Transcription Result ─────────────────────────────────
export interface AudioInsights {
    student_interaction_percentage: number;  // 0–100
    abusive_language_detected: boolean;
    abusive_language_details: string | null;
    class_tone: string;
    key_interactions_summary: string;
}

export interface AudioTranscriptionResult {
    transcript: string;  // Speaker-labeled transcript: [Teacher]: ... [Student]: ...
    insights: AudioInsights;
}

// ── Gemini: Transcribe audio/video ────────────────────────────────────
export async function transcribeRecordingFromSupabase(
    filePath: string,
    mimeType: string
): Promise<AudioTranscriptionResult> {
    console.log(`[Transcription] Downloading ${filePath} from Supabase...`);
    const { data: blob, error } = await supabase.storage.from("recordings").download(filePath);
    if (error || !blob) {
        throw new Error("Failed to download recording from Supabase: " + error?.message);
    }

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Save to temp file for GoogleAIFileManager
    const tempFile = path.join(os.tmpdir(), `upload_${Date.now()}_${path.basename(filePath)}`);
    fs.writeFileSync(tempFile, buffer);

    console.log(`[Transcription] Uploading ${tempFile} to Google AI File Manager...`);
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);
    const uploadResult = await fileManager.uploadFile(tempFile, {
        mimeType,
        displayName: filePath,
    });

    // Cleanup local temp file
    fs.unlinkSync(tempFile);

    console.log(`[Transcription] Gemini generating transcript using file URI: ${uploadResult.file.uri}`);
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 8192
        }
    });

    const result = await model.generateContent([
        {
            fileData: {
                mimeType: uploadResult.file.mimeType,
                fileUri: uploadResult.file.uri
            }
        },
        {
            text: `You are a Classroom Audio Auditor. Listen to this lecture recording carefully and perform two tasks:

TASK 1 - SPEAKER DIARIZATION TRANSCRIPT:
Transcribe the entire recording. Label each speaker as [Teacher] or [Student].
- [Teacher] = the primary speaker, typically speaking in longer, structured monologues.
- [Student] = any secondary speaker asking questions or making brief comments.
Format: "[Teacher]: text... [Student]: text..."

TASK 2 - CLASSROOM INSIGHTS:
Based on the audio, calculate and flag the following:
- student_interaction_percentage: Estimate the percentage of the total speaking time taken up by students (0–100).
- abusive_language_detected: true if the teacher used abusive, discriminatory, or inappropriate language. false otherwise.
- abusive_language_details: If flagged, give a very brief factual description of what was said. Otherwise null.
- class_tone: A short phrase describing the overall atmosphere (e.g., "Formal and one-directional", "Interactive and encouraging").
- key_interactions_summary: 1-2 sentences summarizing the main student interactions.

Return ONLY a valid JSON object. Nothing else.
{
  "transcript": "[Teacher]: ... [Student]: ...",
  "insights": {
    "student_interaction_percentage": 15,
    "abusive_language_detected": false,
    "abusive_language_details": null,
    "class_tone": "Interactive and encouraging",
    "key_interactions_summary": "Students asked 3 questions about Newton's second law."
  }
}`,
        },
    ]);

    const raw = result.response.text().trim();

    console.log(`[Transcription] Deleting file from Gemini Storage...`);
    try {
        await fileManager.deleteFile(uploadResult.file.name);
    } catch (err) {
        console.error("[Transcription] Failed to delete from Gemini storage:", err);
    }

    // Parse the JSON from Gemini
    let parsed: AudioTranscriptionResult;
    try {
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
        parsed = JSON.parse(cleaned);
    } catch {
        // Fallback: treat raw as plain transcript with safe defaults
        parsed = {
            transcript: raw,
            insights: {
                student_interaction_percentage: 0,
                abusive_language_detected: false,
                abusive_language_details: null,
                class_tone: "Could not analyse",
                key_interactions_summary: "Analysis failed."
            }
        };
    }
    return parsed;
}

// ── Gemini: Analyse a plain-text transcript ────────────────────────────────
// Used when a teacher manually types/pastes a transcript (no audio file)
export async function analyzeTranscriptText(
    transcript: string
): Promise<AudioInsights> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 2048,
        },
    });

    const result = await model.generateContent([
        {
            text: `You are a Classroom Transcript Auditor. Analyse the following lecture transcript and return ONLY a valid JSON object — no markdown, no extra text.

The transcript may already have [Teacher] and [Student] labels. If it does not, infer who is teaching vs who is asking questions based on context.

Analyse the following:
- student_interaction_percentage: Estimate the % of total speaking turns/lines taken by students (0–100).
- abusive_language_detected: true if the teacher used abusive, discriminatory, or inappropriate language. Otherwise false.
- abusive_language_details: If flagged, brief factual description. Otherwise null.
- class_tone: A short phrase describing the classroom atmosphere.
- key_interactions_summary: 1–2 sentences summarising the main student interactions.

Return exactly this JSON shape:
{
  "student_interaction_percentage": 15,
  "abusive_language_detected": false,
  "abusive_language_details": null,
  "class_tone": "Formal and one-directional",
  "key_interactions_summary": "No significant student interactions were detected."
}

TRANSCRIPT:
${transcript}`,
        },
    ]);

    const raw = result.response.text().trim();
    try {
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleaned) as AudioInsights;
    } catch {
        return {
            student_interaction_percentage: 0,
            abusive_language_detected: false,
            abusive_language_details: null,
            class_tone: "Could not analyse",
            key_interactions_summary: "Analysis failed.",
        };
    }
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
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            temperature: 0, // 0 ensures deterministic scoring
            responseMimeType: "application/json"
        }
    });

    const prompt = `You are a strict educational AI assistant and forensic text analyzer. You have two distinct tasks:

TASK 1: Note Comparison
Compare a student's handwritten notes (extracted via OCR) with the teacher's lecture transcript.
Analyze how well the student's notes cover the key concepts from the lecture.

TASK 2: Forensic AI Analysis (Detection)
Conduct a deep-layer linguistic audit to determine if the notes are an organic human byproduct or a synthetic AI summary. You must be extremely skeptical of "clean" notes.
Structural Smoothing (AI High Signal): Does the text reorganize a rambling transcript into a perfectly optimized logical hierarchy (e.g., Introduction, Key Points, Conclusion) that the speaker never explicitly structured?
Syntactic Parallelism (AI High Signal): Do bullet points exhibit repetitive grammatical structures (e.g., every line starting with an action verb or gerund)? Humans in real-time environments rarely maintain this level of consistency.
Information Density (AI High Signal): Does the text include "high-level summaries" of complex sections that were only briefly mentioned in the transcript? AI tends to "hallucinate" broader context it already knows about a topic.
Temporal Friction (Human High Signal): Are there "messy" logical leaps, idiosyncratic abbreviations (e.g., "w/o", "b/c", "stats"), or a focus on specific anecdotes/verbal tics that an AI would typically "clean out" as noise?
OCR Artifacts: Look for character-level glitches. If the notes are perfectly formatted Markdown without a single OCR error from handwriting, treat it as a digital copy-paste (High AI Probability).

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
- "feedback": 50 words precise summary of the student's note quality
- "covered": array of key topics the student captured well
- "missing": array of important topics the student missed
- "aiProbability": number from 0 to 100 representing the probability that the text is AI-generated
- "humanProbability": number from 0 to 100 representing the probability that the text is human-written
- "explanation": a crisp, to-the-point explanation (less than 10 words) of why it was flagged as AI or human.

Return ONLY valid JSON, nothing else.`;

    const result = await model.generateContent(prompt);
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
