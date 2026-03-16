import { useState, useRef } from "react";
import { Loader2, Check, Mic, Eye } from "lucide-react";
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
    const [transcribing, setTranscribing] = useState(false);
    const [saving, setSaving] = useState(false);
    const recordingInputRef = useRef<HTMLInputElement>(null);

    const handleRecordingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRecordingFile(file);

        setTranscribing(true);
        try {
            const formData = new FormData();
            formData.append("subject", selectedSubject);
            formData.append("files", file);

            const uploadRes = await fetch("/api/bulk-upload", {
                method: "POST",
                body: formData,
            });
            const uploadData = await uploadRes.json();

            if (!uploadRes.ok || uploadData.failCount > 0) {
                alert("Failed to upload recording");
                setTranscribing(false);
                return;
            }

            const fileId = uploadData.results[0].fileId;

            const transcribeRes = await fetch("/api/lectures/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, mimeType: file.type }),
            });

            const transcribeData = await transcribeRes.json();

            if (transcribeRes.ok) {
                setTranscript(transcribeData.transcript);
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
            <h2 className="text-2xl font-bold text-white">New Lecture</h2>
            <div className="space-y-5">
                {/* Title */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Title</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Newton's Laws of Motion"
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                </div>

                {/* Target Class */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">Target Class</label>
                    <div className="grid grid-cols-3 gap-2">
                        {CLASSES.map((cls) => (
                            <button
                                key={cls}
                                onClick={() => setTargetClass(cls)}
                                className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${targetClass === cls
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
                    <label className="text-sm font-medium text-neutral-400">Upload Recording</label>
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
                            <><Loader2 className="w-5 h-5 animate-spin" /> Transcribing...</>
                        ) : recordingFile ? (
                            <><Check className="w-5 h-5 text-green-400" /> {recordingFile.name}</>
                        ) : (
                            <><Mic className="w-5 h-5" /> Choose audio/video file</>
                        )}
                    </button>
                </div>

                {/* Transcript */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400">
                        Transcript {transcript && "(editable)"}
                    </label>
                    <textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Upload a recording to auto-generate transcript, or type/paste lecture content here..."
                        rows={10}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving || !title || !targetClass || !transcript}
                        className="flex-1 py-3 rounded-xl bg-neutral-800 text-white font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                    >
                        Save as Draft
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={saving || !title || !targetClass || !transcript}
                        className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        Publish
                    </button>
                </div>
            </div>
        </>
    );
}
