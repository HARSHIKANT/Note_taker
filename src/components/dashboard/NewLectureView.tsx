"use client";

import { useState, useRef } from "react";
import { Loader2, Check, Mic, Eye, Lock, PenLine } from "lucide-react";
import { CLASSES } from "@/lib/types";

interface NewLectureViewProps {
    selectedSubject: string;
    onSave: (data: { title: string; targetClass: string; transcript: string }, publish: boolean) => Promise<void>;
}

export function NewLectureView({ selectedSubject, onSave }: NewLectureViewProps) {
    const [title, setTitle] = useState("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [transcript, setTranscript] = useState("");
    const [recordingFile, setRecordingFile] = useState<File | null>(null);
    const [isAudioTranscript, setIsAudioTranscript] = useState(false); // true = locked (auto-generated from audio)
    const [transcribing, setTranscribing] = useState(false);
    const [saving, setSaving] = useState(false);
    const recordingInputRef = useRef<HTMLInputElement>(null);

    const handleRecordingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRecordingFile(file);

        setTranscribing(true);
        try {
            // Step 1 — get a signed upload URL from our API (tiny JSON request, well under Vercel's 4.5MB limit)
            const signRes = await fetch("/api/lectures/upload-audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
            });
            const signData = await signRes.json();

            if (!signRes.ok) {
                alert("Failed to prepare upload: " + signData.error);
                setTranscribing(false);
                return;
            }

            // Step 2 — PUT the file DIRECTLY to Supabase Storage (bypasses Vercel entirely)
            // This is what fixes the 413 / FUNCTION_PAYLOAD_TOO_LARGE error for large files.
            const putRes = await fetch(signData.signedUrl, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
            });

            if (!putRes.ok) {
                alert("Failed to upload recording to storage. Please try again.");
                setTranscribing(false);
                return;
            }

            // Step 3 — trigger transcription with just the stored file path (no file payload)
            const transcribeRes = await fetch("/api/lectures/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filePath: signData.filePath, mimeType: file.type }),
            });

            const transcribeData = await transcribeRes.json();

            if (transcribeRes.ok) {
                setTranscript(transcribeData.transcript);
                setIsAudioTranscript(true); // Lock transcript — came from audio, teacher cannot edit
            } else {
                alert("Transcription failed: " + transcribeData.error);
            }
        } catch (err: any) {
            alert("Error: " + err.message);
        }
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
                            <><Loader2 className="w-5 h-5 animate-spin" /> Transcribing audio...</>
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
