"use client";

import { useState, useRef } from "react";
import { Loader2, Check, Mic, Eye, Lock, PenLine } from "lucide-react";
import { CLASSES } from "@/lib/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface NewLectureViewProps {
    selectedSubject: string;
    geminiApiKey: string;
    onSave: (data: { title: string; targetClass: string; transcript: string }, publish: boolean) => Promise<void>;
}

// Helper: format minutes as MM:SS
function fmtTime(min: number) {
    return `${String(Math.floor(min)).padStart(2, "0")}:00`;
}

export function NewLectureView({ selectedSubject, geminiApiKey, onSave }: NewLectureViewProps) {
    const [title, setTitle] = useState("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [transcript, setTranscript] = useState("");
    const [recordingFile, setRecordingFile] = useState<File | null>(null);
    const [isAudioTranscript, setIsAudioTranscript] = useState(false); // true = locked (auto-generated from audio)
    const [transcribing, setTranscribing] = useState(false);
    const [transcribeStatus, setTranscribeStatus] = useState(""); // Live progress label
    const [saving, setSaving] = useState(false);
    const recordingInputRef = useRef<HTMLInputElement>(null);

    const handleRecordingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRecordingFile(file);
        setTranscribing(true);

        try {
            // ── STEP 1: Upload audio file to Supabase Storage via pre-signed URL ────────
            setTranscribeStatus("Uploading lecture file...");
            const signRes = await fetch("/api/lectures/upload-audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
            });
            const signData = await signRes.json();
            if (!signRes.ok) { alert("Failed to prepare upload: " + signData.error); setTranscribing(false); return; }

            // Direct browser → Supabase upload (bypasses Vercel 4.5MB limit)
            const putRes = await fetch(signData.signedUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
            });
            if (!putRes.ok) { alert("Failed to upload recording to storage."); setTranscribing(false); return; }

            // ── STEP 2: Server-side: Supabase → Google AI File Manager (fast, < 10s on Vercel) ──
            setTranscribeStatus("Preparing lecture for transcription...");
            const uploadRes = await fetch("/api/lectures/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath: signData.filePath, mimeType: file.type }),
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) { alert("Failed to send to transcription: " + uploadData.error); setTranscribing(false); return; }

            const { fileUri, fileName: geminiFileName, fileMimeType } = uploadData;

            // ── STEP 3: Client-side chunked Gemini generation (runs in browser, no Vercel timeout) ──
            // Estimate duration from file size: ~1MB per minute for MP3 (rough estimate)
            const estimatedMinutes = Math.max(10, Math.round(file.size / (1024 * 1024)));
            const CHUNK_SIZE_MIN = 10;
            const totalChunks = Math.ceil(estimatedMinutes / CHUNK_SIZE_MIN);

            if (!geminiApiKey) {
                alert("No Gemini API key found. Please add your key in Settings.");
                setTranscribing(false);
                return;
            }

            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { temperature: 0, maxOutputTokens: 16384 },
            });

            const chunkTranscripts: string[] = [];

            for (let i = 0; i < totalChunks; i++) {
                const startMin = i * CHUNK_SIZE_MIN;
                const endMin = (i + 1) * CHUNK_SIZE_MIN;
                setTranscribeStatus(
                    `Transcribing chunk ${i + 1} of ${totalChunks} (${fmtTime(startMin)} – ${fmtTime(endMin)})...`
                );

                const prompt = `You are a flawless transcriptionist. Listen to the attached audio file carefully.
Transcribe ONLY the audio spoken strictly between ${fmtTime(startMin)} and ${fmtTime(endMin)}.
Label each speaker as [Teacher] or [Student].
If there is no audio in this range, return an empty string.
Return only the raw labelled transcript text. No JSON, no commentary.`;

                try {
                    const result = await model.generateContent([
                        { fileData: { mimeType: fileMimeType, fileUri } },
                        { text: prompt },
                    ]);
                    const chunkText = result.response.text().trim();
                    if (chunkText) chunkTranscripts.push(chunkText);
                } catch (chunkErr: any) {
                    console.error(`[Chunk ${i + 1}] Error:`, chunkErr.message);
                    // Continue with remaining chunks even if one fails
                }
            }

            const fullTranscript = chunkTranscripts.join("\n\n");

            // ── STEP 4: Clean up Supabase storage and Google AI File Manager ────────────
            setTranscribeStatus("Finalising...");
            try {
                const cleanupRes = await fetch("/api/lectures/transcribe", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filePath: signData.filePath, geminiFileName }),
                });
                if (!cleanupRes.ok) {
                    const cleanupErr = await cleanupRes.json().catch(() => ({}));
                    console.error("[Cleanup] Failed to delete recording:", cleanupErr);
                } else {
                    console.log("[Cleanup] Recording deleted from Supabase and Gemini File Manager.");
                }
            } catch (cleanupErr: any) {
                console.error("[Cleanup] Network error during cleanup:", cleanupErr.message);
            }

            if (!fullTranscript) {
                alert("Transcription returned no text. Please try a shorter or clearer recording.");
                setTranscribing(false);
                return;
            }

            setTranscript(fullTranscript);
            setIsAudioTranscript(true); // Lock — came from audio, teacher cannot edit
        } catch (err: any) {
            alert("Error: " + err.message);
        }

        setTranscribeStatus("");
        setTranscribing(false);
    };

    const handleSave = async (publish: boolean) => {
        if (!title || !targetClass || !transcript) {
            alert("Please fill in all fields");
            return;
        }
        setSaving(true);
        await onSave({ title, targetClass, transcript }, publish);
        setSaving(false);
    };

    return (
        <>
            <h2 className="text-2xl lg:text-3xl font-bold text-white">New Lecture</h2>
            <div className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300">Title</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Newton's Laws of Motion"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 lg:py-3.5 text-white lg:text-base placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                </div>

                {/* Target Class */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300">Target Class</label>
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                        {CLASSES.map((cls) => (
                            <button
                                key={cls}
                                onClick={() => setTargetClass(cls)}
                                className={`py-2.5 lg:py-3 rounded-xl text-sm lg:text-base font-semibold transition-all ${targetClass === cls
                                    ? "bg-blue-600 text-white shadow-lg"
                                    : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                                    }`}
                            >
                                Class {cls}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Recording Upload */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300">
                        Upload Recording <span className="text-neutral-500">(optional)</span>
                    </label>
                    <input
                        type="file"
                        accept="audio/*,video/*"
                        className="hidden"
                        ref={recordingInputRef}
                        onChange={handleRecordingUpload}
                    />
                    <button
                        onClick={() => recordingInputRef.current?.click()}
                        disabled={transcribing}
                        className="w-full p-4 rounded-xl border-2 border-dashed border-neutral-800 hover:border-neutral-700 transition-colors flex items-center justify-center gap-3 text-neutral-400 hover:text-white disabled:opacity-50"
                    >
                        {transcribing ? (
                            <span className="flex flex-col items-center gap-1">
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Transcribing...
                                </span>
                                {transcribeStatus && (
                                    <span className="text-xs text-neutral-500">{transcribeStatus}</span>
                                )}
                            </span>
                        ) : recordingFile ? (
                            <><Check className="w-5 h-5 text-green-400" /> {recordingFile.name}</>
                        ) : (
                            <><Mic className="w-5 h-5" /> Choose audio/video file</>
                        )}
                    </button>
                </div>

                {/* Transcript */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300 flex items-center gap-1.5">
                        Transcript
                        {!isAudioTranscript && transcript && (
                            <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                <PenLine className="w-3 h-3" /> Editable
                            </span>
                        )}
                    </label>

                    {isAudioTranscript ? (
                        <div className="w-full bg-amber-950/20 border border-amber-900/40 rounded-xl px-5 py-6 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center">
                                <Lock className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <h3 className="text-amber-500 font-medium">Auto-generated & Locked</h3>
                                <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">
                                    The transcript has been securely generated from your audio file. It is hidden from view to ensure analysis integrity.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                placeholder="Upload a recording to auto-generate transcript, or type/paste lecture content here..."
                                rows={10}
                                className="w-full border bg-neutral-900 border-neutral-800 focus:ring-2 focus:ring-blue-600 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none resize-none transition-colors"
                            />
                            <p className="text-xs text-neutral-600">
                                AI classroom analysis (interaction %, tone, safety check) runs automatically when you publish.
                            </p>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving || !title || !targetClass || !transcript}
                        className="flex-1 py-3 lg:py-3.5 rounded-xl bg-neutral-800 text-white lg:text-base font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                    >
                        Save as Draft
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={saving || !title || !targetClass || !transcript}
                        className="flex-1 py-3 lg:py-3.5 rounded-xl bg-blue-600 text-white lg:text-base font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Publish
                    </button>
                </div>
            </div>
        </>
    );
}
