import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { supabase } from "@/lib/supabase";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import sharp from "sharp";

// ── Model Fallback Chain ────────────────────────────────────────────────────
// Primary → Fallback 1 → Fallback 2, with up to 3 retry rounds (0s, 20s, 40s wait)
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"] as const;
const RETRY_WAIT_MS = [0, 20_000, 40_000]; // wait before round 2 and 3

export function isRateLimitError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota");
}

/**
 * Tries modelFn with each model in GEMINI_MODELS.
 * If all rate-limit, waits and retries (up to 3 rounds: immediate → 20s → 40s).
 * Non-rate-limit errors throw immediately.
 */
export async function callWithModelFallback<T>(
    label: string,
    modelFn: (modelName: string) => Promise<T>
): Promise<T> {
    let lastError: unknown;

    for (let round = 0; round < RETRY_WAIT_MS.length; round++) {
        if (round > 0) {
            const waitSec = RETRY_WAIT_MS[round] / 1000;
            console.warn(`[${label}] All models rate-limited. Waiting ${waitSec}s before retry round ${round + 1}/${RETRY_WAIT_MS.length}...`);
            await new Promise((r) => setTimeout(r, RETRY_WAIT_MS[round]));
        }

        for (const modelName of GEMINI_MODELS) {
            try {
                console.log(`[${label}] Trying model: ${modelName} (round ${round + 1})...`);
                const result = await modelFn(modelName);
                console.log(`[${label}] ${modelName} succeeded.`);
                return result;
            } catch (err) {
                if (isRateLimitError(err)) {
                    console.warn(`[${label}] Rate limit on ${modelName}.`);
                    lastError = err;
                    continue;
                }
                throw err; // Non-rate-limit errors propagate immediately
            }
        }
    }

    throw lastError ?? new Error(`[${label}] All models and retry rounds exhausted`);
}

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

// ── OCR: with model fallback chain + round-based retry ──────────────────────
export async function ocrImageFromDrive(
    accessToken: string,
    fileIds: string[],
    geminiApiKey: string
): Promise<string> {
    // Download all images in parallel (only once — reused across all retries)
    const downloads = await Promise.all(
        fileIds.map((id) => downloadFromDrive(accessToken, id))
    );

    const parts: any[] = [
        ...downloads.map((d) => ({ inlineData: { mimeType: d.mimeType, data: d.buffer.toString("base64") } })),
        { text: "Extract ALL text from these images of handwritten notes. Organize and structure the extracted text logically (e.g., using headings, bullet points, and appropriate formatting based on the layout of the notes). Combine the text from all pages cohesively. Output ONLY the structured text content, nothing else. If no text is found, respond with exactly: NO_TEXT_FOUND" },
    ];

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    const extractedText = await callWithModelFallback("OCR", async (modelName) => {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0 } });
        const result = await model.generateContent(parts);
        const text = result.response.text().trim();
        console.log(`[OCR] ${modelName} extracted text length: ${text.length} chars`);
        return text;
    });

    return extractedText === "NO_TEXT_FOUND" ? "" : extractedText;
}

// ── Types: Audio Transcription Result ─────────────────────────────────

export interface ContentQualityParameter {
    score: number;   // 0–10
    note: string;    // 1-sentence justification
}

export interface ContentQuality {
    overall_score: number;         // 0–100 weighted average
    explanation_quality: ContentQualityParameter;
    title_relevance: ContentQualityParameter;
    content_correctness: ContentQualityParameter;
    depth_and_coverage: ContentQualityParameter;
    engagement_style: ContentQualityParameter;
}

export interface ToneDimension {
    detected: boolean;
    severity: "low" | "medium" | "high" | null;
    examples: string[];  // up to 2 quoted excerpts
}

export interface ToneAnalysis {
    harsh_language: ToneDimension;
    emotional_statements: ToneDimension;
    negative_statements: ToneDimension;
}

export interface AudioInsights {
    student_interaction_percentage: number;  // 0–100
    abusive_language_detected: boolean;
    abusive_language_details: string | null;
    class_tone: string;
    key_interactions_summary: string;
    content_quality: ContentQuality | null;
    tone_analysis: ToneAnalysis | null;
}

export interface AudioTranscriptionResult {
    transcript: string;  // Speaker-labeled transcript: [Teacher]: ... [Student]: ...
    insights: AudioInsights;
}

// ── Gemini: Upload audio to File Manager only (server-side, fast, no generation) ────
// Used by the chunked transcription flow: returns the fileUri so the client-side JS
// can call generateContent directly from the browser (bypassing Vercel's 10s timeout).
export async function uploadRecordingToFileManager(
    filePath: string,
    mimeType: string,
    geminiApiKey: string
): Promise<{ fileUri: string; fileName: string; fileMimeType: string }> {
    console.log(`[Transcription] Downloading ${filePath} from Supabase...`);
    const { data: blob, error } = await supabase.storage.from("recordings").download(filePath);
    if (error || !blob) {
        throw new Error("Failed to download recording from Supabase: " + error?.message);
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const tempFile = path.join(os.tmpdir(), `upload_${Date.now()}_${path.basename(filePath)}`);
    fs.writeFileSync(tempFile, buffer);

    console.log(`[Transcription] Uploading ${tempFile} to Google AI File Manager...`);
    const fileManager = new GoogleAIFileManager(geminiApiKey);
    const uploadResult = await fileManager.uploadFile(tempFile, {
        mimeType,
        displayName: filePath,
    });

    fs.unlinkSync(tempFile);
    console.log(`[Transcription] File uploaded. URI: ${uploadResult.file.uri}`);

    return {
        fileUri: uploadResult.file.uri,
        fileName: uploadResult.file.name, // needed later to delete from Gemini storage
        fileMimeType: uploadResult.file.mimeType,
    };
}

// ── Gemini: Transcribe audio/video ────────────────────────────────────
export async function transcribeRecordingFromSupabase(
    filePath: string,
    mimeType: string,
    geminiApiKey: string
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
    const fileManager = new GoogleAIFileManager(geminiApiKey);
    const uploadResult = await fileManager.uploadFile(tempFile, {
        mimeType,
        displayName: filePath,
    });

    // Cleanup local temp file
    fs.unlinkSync(tempFile);

    console.log(`[Transcription] Gemini generating transcript using file URI: ${uploadResult.file.uri}`);
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    const TRANSCRIPTION_PROMPT = `You are a Classroom Audio Auditor. Listen to this lecture recording carefully and perform the following analysis.

TASK 1 - SPEAKER DIARIZATION TRANSCRIPT:
Transcribe the entire recording. Label each speaker as [Teacher] or [Student].
- [Teacher] = the primary speaker, typically speaking in longer, structured monologues.
- [Student] = any secondary speaker asking questions or making brief comments.
Format: "[Teacher]: text... [Student]: text..."

TASK 2 - CLASSROOM INSIGHTS:
Based on the audio, produce ALL of the following fields:

Basic metrics:
- student_interaction_percentage: Estimate the percentage of the total speaking time taken up by students (0–100).
- abusive_language_detected: true if the teacher used abusive, discriminatory, or inappropriate language. false otherwise.
- abusive_language_details: If flagged, give a very brief factual description. Otherwise null.
- class_tone: A short phrase describing the overall atmosphere.
- key_interactions_summary: 1-2 sentences summarizing the main student interactions.

Content Quality (score each parameter 0–10):
- explanation_quality: Is the explanation clear, step-by-step, accessible? Does the teacher use examples/analogies?
- title_relevance: How well does the lecture title match what was actually taught?
- content_correctness: Are facts, formulas, and definitions accurate? Flag any errors.
- depth_and_coverage: Is the topic explored thoroughly? Are subtopics given appropriate time?
- engagement_style: Does the teacher use questions, stories, real-world examples to engage students?
For each: provide a score (0–10) and a one-sentence note. Compute overall_score as a weighted average (0–100).

Tone & Language Analysis (beyond abusive flag):
- harsh_language: Dismissive, belittling, or condescending phrases toward students.
- emotional_statements: Expressions of frustration, favoritism, or over-emotional reactions.
- negative_statements: Demotivating comments that discourage learning.
For each: detected (boolean), severity ("low"|"medium"|"high"|null), examples (array of up to 2 quoted excerpts — empty array if none).

Return ONLY a valid JSON object. Nothing else.
{
  "transcript": "[Teacher]: ... [Student]: ...",
  "insights": {
    "student_interaction_percentage": 15,
    "abusive_language_detected": false,
    "abusive_language_details": null,
    "class_tone": "Interactive and encouraging",
    "key_interactions_summary": "Students asked 3 questions about Newton's second law.",
    "content_quality": {
      "overall_score": 74,
      "explanation_quality": { "score": 8, "note": "Clear step-by-step with good examples." },
      "title_relevance": { "score": 9, "note": "Content closely matched the stated title." },
      "content_correctness": { "score": 7, "note": "Minor error in Third Law example." },
      "depth_and_coverage": { "score": 6, "note": "Friction subtopic was rushed." },
      "engagement_style": { "score": 5, "note": "Few student questions were posed." }
    },
    "tone_analysis": {
      "harsh_language": { "detected": false, "severity": null, "examples": [] },
      "emotional_statements": { "detected": true, "severity": "low", "examples": ["'I really hope you all study this tonight.'"] },
      "negative_statements": { "detected": false, "severity": null, "examples": [] }
    }
  }
}`;

    const raw = await callWithModelFallback("Transcription", async (modelName) => {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 65536 },
        });
        const result = await model.generateContent([
            { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
            { text: TRANSCRIPTION_PROMPT },
        ]);
        return result.response.text().trim();
    });

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
                key_interactions_summary: "Analysis failed.",
                content_quality: null,
                tone_analysis: null,
            }
        };
    }
    return parsed;
}

// ── Gemini: Analyse a plain-text transcript ────────────────────────────────
// Used when a teacher manually types/pastes a transcript (no audio file)
export async function analyzeTranscriptText(
    transcript: string,
    geminiApiKey: string
): Promise<AudioInsights> {
    const genAI = new GoogleGenerativeAI(geminiApiKey);

    const ANALYSIS_PROMPT = `You are a Classroom Transcript Auditor. Analyse the following lecture transcript and return ONLY a valid JSON object — no markdown, no extra text.

The transcript may already have [Teacher] and [Student] labels. If it does not, infer who is teaching vs who is asking questions based on context.

Produce ALL of the following fields:

Basic metrics:
- student_interaction_percentage: Estimate the % of total speaking turns/lines taken by students (0–100).
- abusive_language_detected: true if the teacher used abusive, discriminatory, or inappropriate language. Otherwise false.
- abusive_language_details: If flagged, brief factual description. Otherwise null.
- class_tone: A short phrase describing the classroom atmosphere.
- key_interactions_summary: 1–2 sentences summarising the main student interactions.

Content Quality (analyse the lecture TEXT and score each parameter 0–10):
- explanation_quality: Is the explanation clear, step-by-step, accessible? Does the teacher use examples/analogies?
- title_relevance: How well does the lecture title (if present in text) match what was actually taught? If no title is discernible, score based on topic coherence.
- content_correctness: Are facts, formulas, and definitions stated accurately? Flag any errors.
- depth_and_coverage: Is the topic explored thoroughly? Are subtopics given appropriate time?
- engagement_style: Does the teacher use questions, stories, real-world examples to engage students?
For each: provide a score (0–10) and a one-sentence note. Compute overall_score as a weighted average (0–100).

Tone & Language Analysis (beyond abusive flag):
- harsh_language: Dismissive, belittling, or condescending phrases toward students.
- emotional_statements: Expressions of frustration, favoritism, or over-emotional reactions.
- negative_statements: Demotivating comments that discourage learning.
For each: detected (boolean), severity ("low"|"medium"|"high"|null if not detected), examples (array of up to 2 direct quoted excerpts — empty array if none).

Return exactly this JSON shape:
{
  "student_interaction_percentage": 15,
  "abusive_language_detected": false,
  "abusive_language_details": null,
  "class_tone": "Formal and one-directional",
  "key_interactions_summary": "No significant student interactions were detected.",
  "content_quality": {
    "overall_score": 74,
    "explanation_quality": { "score": 8, "note": "Clear step-by-step with good examples." },
    "title_relevance": { "score": 9, "note": "Content closely matched the stated title." },
    "content_correctness": { "score": 7, "note": "Minor inaccuracy noted in one formula." },
    "depth_and_coverage": { "score": 6, "note": "Some subtopics were rushed." },
    "engagement_style": { "score": 5, "note": "Few questions posed to students." }
  },
  "tone_analysis": {
    "harsh_language": { "detected": false, "severity": null, "examples": [] },
    "emotional_statements": { "detected": false, "severity": null, "examples": [] },
    "negative_statements": { "detected": false, "severity": null, "examples": [] }
  }
}

TRANSCRIPT:
${transcript}`;

    const raw = await callWithModelFallback("analyzeTranscriptText", async (modelName) => {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 16384 },
        });
        const result = await model.generateContent([{ text: ANALYSIS_PROMPT }]);
        return result.response.text().trim();
    });

    try {
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleaned) as AudioInsights;
    } catch {
        console.error("[analyzeTranscriptText] JSON parse failed. Raw Gemini output:", raw);
        return {
            student_interaction_percentage: 0,
            abusive_language_detected: false,
            abusive_language_details: null,
            class_tone: "Could not analyse",
            key_interactions_summary: "Analysis failed.",
            content_quality: null,
            tone_analysis: null,
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
    lectureContent: string,
    geminiApiKey: string
): Promise<MatchResult> {
    const genAI = new GoogleGenerativeAI(geminiApiKey);

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

    return callWithModelFallback("compareNotes", async (modelName) => {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
        });
        const result = await model.generateContent(prompt);
        const cleaned = result.response.text().replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleaned) as MatchResult;
    });
}

