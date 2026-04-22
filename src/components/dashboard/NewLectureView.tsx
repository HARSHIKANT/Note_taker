"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Check, Mic, Eye, Lock, PenLine, GraduationCap, Radio, MicOff, Square } from "lucide-react";
import { CLASSES } from "@/lib/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface NewLectureViewProps {
    selectedSubject: string;
    geminiApiKey: string;
    /** True when navigated via a Course card — hides the class picker */
    isCourseMode?: boolean;
    onSave: (data: { title: string; targetClass: string; transcript: string; courseId?: string }, publish: boolean) => Promise<void>;
}

// Helper: format minutes as MM:SS
function fmtTime(min: number) {
    return `${String(Math.floor(min)).padStart(2, "0")}:00`;
}

// Web Speech API — not in default TS dom lib, so use any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export function NewLectureView({ selectedSubject, geminiApiKey, isCourseMode, onSave }: NewLectureViewProps) {
    const [title, setTitle] = useState("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [transcript, setTranscript] = useState("");
    const [recordingFile, setRecordingFile] = useState<File | null>(null);
    const [isAudioTranscript, setIsAudioTranscript] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [transcribeStatus, setTranscribeStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const recordingInputRef = useRef<HTMLInputElement>(null);

    // ── Live Dictation State ──────────────────────────────────────────────────
    const [inputMode, setInputMode] = useState<"manual" | "live">("manual");
    const [isLiveTranscript, setIsLiveTranscript] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [interimText, setInterimText] = useState(""); // live preview of current partial sentence
    const [liveSeconds, setLiveSeconds] = useState(0);
    const recognitionRef = useRef<AnySpeechRecognition>(null);
    const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const transcriptRef = useRef(""); // sync ref so event handlers always get latest value
    const liveEndRef = useRef<HTMLDivElement>(null);

    // Keep transcriptRef in sync
    useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

    // Auto-scroll live transcript to bottom
    useEffect(() => {
        if (isListening) liveEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript, interimText, isListening]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            recognitionRef.current?.stop();
            if (liveTimerRef.current) clearInterval(liveTimerRef.current);
        };
    }, []);

    const startLiveTranscription = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            alert("Live transcription is not supported in your browser. Please use Chrome or Edge.");
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            let interim = "";
            let newFinal = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    newFinal += result[0].transcript + " ";
                } else {
                    interim += result[0].transcript;
                }
            }

            if (newFinal) {
                setTranscript((prev) => prev + newFinal);
            }
            setInterimText(interim);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
            if (event.error === "not-allowed") {
                alert("Microphone permission denied. Please allow microphone access and try again.");
            }
            console.error("[SpeechRecognition] Error:", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            // Auto-restart if still "listening" (handles browser timeout)
            if (recognitionRef.current) {
                try { recognition.start(); } catch { /* already stopped */ }
            }
        };

        recognitionRef.current = recognition;
        recognition.start();

        setIsListening(true);
        setIsLiveTranscript(true);
        setTranscript(""); // fresh start for live session
        setInterimText("");
        setLiveSeconds(0);

        liveTimerRef.current = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    }, []);

    const stopLiveTranscription = useCallback(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setIsListening(false);
        // Flush any pending interim text so it's not lost when stopping mid-sentence
        setTranscript((prev) => {
            const pending = interimText.trim();
            return pending ? prev + pending + " " : prev;
        });
        setInterimText("");
        if (liveTimerRef.current) {
            clearInterval(liveTimerRef.current);
            liveTimerRef.current = null;
        }
    }, [interimText]);

    // Switch back to manual clears live state
    const handleModeSwitch = (mode: "manual" | "live") => {
        if (isListening) stopLiveTranscription();
        setInputMode(mode);
        setIsLiveTranscript(false);
        setIsAudioTranscript(false);
        setTranscript("");
        setRecordingFile(null);
        setInterimText("");
    };

    // Format live timer
    const fmtLiveTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    // Course mode (driven by parent context, not a toggle here)
    const [selectedCourseId] = useState(""); // unused when isCourseMode — parent holds the ID

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
        if (!title || !transcript) return;
        if (!isCourseMode && !targetClass) return;

        setSaving(true);
        await onSave(
            { title, targetClass, transcript },
            publish
        );
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

                {/* Course mode banner */}
                {isCourseMode && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">
                        <GraduationCap className="w-4 h-4 flex-shrink-0" />
                        <span>Uploading to course: <strong>{selectedSubject}</strong>. No class selection needed.</span>
                    </div>
                )}

                {/* Target Class (hidden in course mode) */}
                {!isCourseMode && (
                    <div className="space-y-2">
                        <label className="text-sm lg:text-base font-medium text-neutral-300">Target Class</label>
                        <div className="grid grid-cols-3 gap-3">
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
                )}

                {/* ── Transcript Input Mode Selector ──────────────────────────────────── */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300">Transcript Source</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => handleModeSwitch("manual")}
                            disabled={isListening}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all ${inputMode === "manual"
                                ? "bg-blue-600/15 border-blue-600/40 text-blue-300"
                                : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
                                }`}
                        >
                            <PenLine className="w-4 h-4" /> Type / Upload Audio
                        </button>
                        <button
                            onClick={() => handleModeSwitch("live")}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all ${inputMode === "live"
                                ? "bg-red-500/15 border-red-500/40 text-red-300"
                                : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300"
                                }`}
                        >
                            <Radio className="w-4 h-4" /> Live Dictation
                        </button>
                    </div>
                </div>

                {/* ── Recording Upload (only in manual mode) ─────────────────────────── */}
                {inputMode === "manual" && (
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
                )}

                {/* ── Live Dictation Controls (only in live mode) ─────────────────────── */}
                {inputMode === "live" && (
                    <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="space-y-0.5">
                                <p className="text-sm font-semibold text-red-300 flex items-center gap-2">
                                    <Radio className="w-4 h-4" /> Live Lecture Dictation
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Microphone captures teacher & student voices. Transcript is read-only.
                                </p>
                            </div>
                            {isListening ? (
                                <button
                                    onClick={stopLiveTranscription}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                                >
                                    <Square className="w-3.5 h-3.5 fill-white" /> Stop — {fmtLiveTime(liveSeconds)}
                                </button>
                            ) : (
                                <button
                                    onClick={startLiveTranscription}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                                >
                                    <Mic className="w-3.5 h-3.5" /> Start Recording
                                </button>
                            )}
                        </div>

                        {/* Pulsing activity indicator */}
                        {isListening && (
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                </span>
                                <span className="text-xs text-red-400 font-medium">Recording in progress...</span>
                                <span className="text-xs text-neutral-600 ml-auto">{fmtLiveTime(liveSeconds)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Transcript Box (3-state) ────────────────────────────────────────── */}
                <div className="space-y-2">
                    <label className="text-sm lg:text-base font-medium text-neutral-300 flex items-center gap-1.5">
                        Transcript
                        {isLiveTranscript && !isListening && transcript && (
                            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                                <MicOff className="w-3 h-3" /> Locked — Live Recording
                            </span>
                        )}
                        {isListening && (
                            <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
                                <Mic className="w-3 h-3" /> Recording Live
                            </span>
                        )}
                        {!isAudioTranscript && !isLiveTranscript && transcript && (
                            <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                <PenLine className="w-3 h-3" /> Editable
                            </span>
                        )}
                    </label>

                    {/* STATE 1: Audio upload lock (existing behaviour — transcript hidden) */}
                    {isAudioTranscript ? (
                        <div className="w-full bg-amber-950/20 border border-amber-900/40 rounded-xl px-5 py-6 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center">
                                <Lock className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <h3 className="text-amber-500 font-medium">Auto-generated &amp; Locked</h3>
                                <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">
                                    The transcript has been securely generated from your audio file. It is hidden from view to ensure analysis integrity.
                                </p>
                            </div>
                        </div>

                    ) : isLiveTranscript ? (
                        /* STATE 2: Live dictation — visible, scrollable, read-only */
                        <div className="relative w-full bg-neutral-950 border border-red-900/40 rounded-xl overflow-hidden">
                            {/* Live transcript content */}
                            <div className="h-56 overflow-y-auto px-4 py-3 space-y-1 text-sm text-neutral-300 leading-relaxed font-mono">
                                {transcript ? (
                                    <>
                                        <span>{transcript}</span>
                                        {interimText && (
                                            <span className="text-neutral-600 italic">{interimText}</span>
                                        )}
                                    </>
                                ) : isListening ? (
                                    <span className="text-neutral-600 italic">Listening… start speaking.</span>
                                ) : (
                                    <span className="text-neutral-600 italic">Press "Start Recording" to begin.</span>
                                )}
                                <div ref={liveEndRef} />
                            </div>
                            {/* Readonly overlay badge */}
                            <div className="absolute top-2 right-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-950/60 border border-red-900/60 px-2 py-0.5 rounded">
                                    Read Only
                                </span>
                            </div>
                        </div>

                    ) : (
                        /* STATE 3: Manual editable textarea (existing behaviour) */
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
                        disabled={saving || !title || (!isCourseMode && !targetClass) || !transcript || isListening}
                        className="flex-1 py-3 lg:py-3.5 rounded-xl bg-neutral-800 text-white lg:text-base font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                    >
                        Save as Draft
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={saving || !title || (!isCourseMode && !targetClass) || !transcript || isListening}
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
