"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
    LogOut, BookOpen, Upload, X, Plus, Loader2, FileText,
    Smartphone, Camera, ChevronLeft, Check, AlertCircle, Atom,
    FlaskConical, Calculator,
} from "lucide-react";
import Image from "next/image";
import { SUBJECTS } from "@/lib/types";

const SUBJECT_ICONS: Record<string, any> = {
    Physics: Atom,
    Chemistry: FlaskConical,
    Math: Calculator,
};

interface Lecture {
    id: string;
    title: string;
    subject: string;
    class: string;
    published: boolean;
    created_at: string;
}

interface UploadRecord {
    id: string;
    file_id: string;
    lecture_id: string;
    ocr_text: string;
    match_score: number | null;
    ai_feedback: string;
    ocr_status: string;
    created_at: string;
}

interface AIFeedback {
    score: number;
    feedback: string;
    covered: string[];
    missing: string[];
}

type View = "subjects" | "lectures" | "upload";

export function StudentDashboard() {
    const { data: session } = useSession();
    const extSession = session as any;

    const [view, setView] = useState<View>("subjects");
    const [selectedSubject, setSelectedSubject] = useState<string>("");
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
    const [myUploads, setMyUploads] = useState<UploadRecord[]>([]);
    const [loading, setLoading] = useState(false);

    // Upload state
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [showSourceMenu, setShowSourceMenu] = useState(false);

    // Camera state
    const [showCamera, setShowCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Selected feedback
    const [selectedFeedback, setSelectedFeedback] = useState<AIFeedback | null>(null);

    const fetchLectures = async (subject: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/lectures?subject=${subject}`);
            const data = await res.json();
            setLectures(data.lectures || []);
        } catch { setLectures([]); }
        setLoading(false);
    };

    const fetchMyUploads = async (lectureId: string) => {
        try {
            const res = await fetch(`/api/student-uploads?lecture_id=${lectureId}`);
            const data = await res.json();
            setMyUploads(data.uploads || []);
        } catch { setMyUploads([]); }
    };

    const openSubject = (subject: string) => {
        setSelectedSubject(subject);
        setView("lectures");
        fetchLectures(subject);
    };

    const openLectureUpload = (lecture: Lecture) => {
        setSelectedLecture(lecture);
        setView("upload");
        setFiles([]);
        setPreviews([]);
        setLogs([]);
        fetchMyUploads(lecture.id);
    };

    // Camera functions
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });
            setCameraStream(stream);
            setShowCamera(true);
            setShowSourceMenu(false);
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 100);
        } catch {
            alert("Could not access camera.");
        }
    };

    const stopCamera = () => {
        cameraStream?.getTracks().forEach((t) => t.stop());
        setCameraStream(null);
        setShowCamera(false);
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], `note_${Date.now()}.jpg`, { type: "image/jpeg" });
                    setFiles((prev) => [...prev, file]);
                    setPreviews((prev) => [...prev, URL.createObjectURL(file)]);
                }
            }, "image/jpeg", 0.8);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setFiles((prev) => [...prev, ...newFiles]);
            setPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
        }
        setShowSourceMenu(false);
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
        setPreviews((prev) => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    // Compress images client-side before upload to stay under Vercel's 4.5MB limit
    const compressImage = (file: File, maxDim = 1200, quality = 0.75): Promise<File> =>
        new Promise((resolve) => {
            if (!file.type.startsWith("image/")) { resolve(file); return; }
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
                    else { width = Math.round((width * maxDim) / height); height = maxDim; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width; canvas.height = height;
                canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file),
                    "image/jpeg", quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = url;
        });

    const handleUpload = async () => {
        if (files.length === 0 || !selectedLecture) return;
        setUploading(true);
        setLogs([]);

        setLogs((prev) => [...prev, `🗌 Compressing ${files.length} images...`]);
        const compressed = await Promise.all(files.map((f) => compressImage(f)));

        const formData = new FormData();
        formData.append("subject", selectedSubject);
        formData.append("lecture_id", selectedLecture.id);
        compressed.forEach((file) => formData.append("files", file));

        try {
            const res = await fetch("/api/bulk-upload", { method: "POST", body: formData });
            const data = await res.json();

            if (res.ok) {
                const successResults = data.results.filter((r: any) => r.status === "success");
                setLogs((prev) => [...prev, `✅ Uploaded ${successResults.length} files`]);

                // Trigger OCR for the combined batch
                if (data.uploadId && data.fileIds && data.fileIds.length > 0) {
                    setLogs((prev) => [...prev, `🔍 Processing OCR for ${data.fileIds.length} pages...`]);
                    try {
                        const ocrRes = await fetch("/api/ocr", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                upload_id: data.uploadId,
                                file_ids: data.fileIds,
                                lecture_id: selectedLecture.id,
                            }),
                        });
                        const ocrData = await ocrRes.json();
                        if (ocrRes.ok) {
                            setLogs((prev) => [
                                ...prev,
                                `✅ OCR Complete: Match score ${ocrData.match?.score}%`,
                            ]);
                        } else {
                            setLogs((prev) => [...prev, `⚠️ OCR failed for this submission`]);
                        }
                    } catch {
                        setLogs((prev) => [...prev, `⚠️ OCR error for this submission`]);
                    }
                }

                setFiles([]);
                setPreviews([]);
                fetchMyUploads(selectedLecture.id);
            } else {
                setLogs((prev) => [...prev, `❌ Upload failed: ${data.error}`]);
            }
        } catch (err: any) {
            setLogs((prev) => [...prev, `❌ Network Error: ${err.message}`]);
        }

        setUploading(false);
    };

    const parseFeedback = (upload: UploadRecord): AIFeedback | null => {
        if (!upload.ai_feedback) return null;
        try {
            return JSON.parse(upload.ai_feedback);
        } catch {
            return null;
        }
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-neutral-950/80 backdrop-blur-xl border-b border-neutral-800">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {view !== "subjects" && (
                            <button
                                onClick={() => {
                                    if (view === "upload") { setView("lectures"); setSelectedLecture(null); }
                                    else { setView("subjects"); setSelectedSubject(""); }
                                }}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                                {session?.user?.name?.[0] || "S"}
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm">{session?.user?.name}</p>
                                <p className="text-xs text-neutral-500">Class {extSession?.class} • Student</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => signOut()} className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                {/* SUBJECTS VIEW */}
                {view === "subjects" && (
                    <>
                        <h2 className="text-2xl font-bold text-white">My Subjects</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {SUBJECTS.map((sub) => {
                                const Icon = SUBJECT_ICONS[sub] || BookOpen;
                                return (
                                    <button
                                        key={sub}
                                        onClick={() => openSubject(sub)}
                                        className="group p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all text-left hover:shadow-lg hover:shadow-purple-500/5"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                                            <Icon className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">{sub}</h3>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* LECTURES VIEW */}
                {view === "lectures" && (
                    <>
                        <h2 className="text-2xl font-bold text-white">{selectedSubject}</h2>
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                            </div>
                        ) : lectures.length === 0 ? (
                            <div className="text-center py-16 space-y-3">
                                <BookOpen className="w-12 h-12 text-neutral-600 mx-auto" />
                                <p className="text-neutral-400">No assignments available yet</p>
                                <p className="text-sm text-neutral-600">Your teacher hasn&apos;t published any lectures for this subject.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {lectures.map((lec) => (
                                    <div
                                        key={lec.id}
                                        className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-between"
                                    >
                                        <div>
                                            <h3 className="font-semibold text-white">{lec.title}</h3>
                                            <p className="text-xs text-neutral-500 mt-1">
                                                {new Date(lec.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => openLectureUpload(lec)}
                                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium transition-colors"
                                        >
                                            <Upload className="w-4 h-4" />
                                            Upload Notes
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* UPLOAD VIEW */}
                {view === "upload" && selectedLecture && (
                    <>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{selectedLecture.title}</h2>
                            <p className="text-sm text-neutral-500">{selectedSubject} • Upload your notes</p>
                        </div>

                        {/* Previous Submissions */}
                        {myUploads.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-neutral-400">Previous Submissions</h3>
                                {myUploads.map((upload) => {
                                    const fb = parseFeedback(upload);
                                    return (
                                        <button
                                            key={upload.id}
                                            className="w-full text-left p-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
                                            onClick={() => setSelectedFeedback(fb)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-neutral-300">
                                                    {new Date(upload.created_at).toLocaleDateString()}
                                                </span>
                                                {upload.ocr_status === "completed" && upload.match_score != null ? (
                                                    <span className={`text-sm font-semibold px-2 py-1 rounded-lg ${upload.match_score >= 80 ? "bg-green-500/10 text-green-400" :
                                                        upload.match_score >= 50 ? "bg-yellow-500/10 text-yellow-400" :
                                                            "bg-red-500/10 text-red-400"
                                                        }`}>
                                                        {upload.match_score}%
                                                    </span>
                                                ) : upload.ocr_status === "processing" ? (
                                                    <span className="text-xs text-neutral-500 flex items-center gap-1">
                                                        <Loader2 className="w-3 h-3 animate-spin" /> Processing
                                                    </span>
                                                ) : upload.ocr_status === "failed" ? (
                                                    <span className="text-xs text-red-400 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" /> Failed
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-neutral-500">Pending</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* AI Feedback Panel */}
                        {selectedFeedback && (
                            <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-white">AI Feedback</h3>
                                    <button onClick={() => setSelectedFeedback(null)} className="text-neutral-500 hover:text-white">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                {/* Score bar */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-400">Match Score</span>
                                        <span className="font-semibold text-white">{selectedFeedback.score}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${selectedFeedback.score >= 80 ? "bg-green-500" :
                                                selectedFeedback.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                }`}
                                            style={{ width: `${selectedFeedback.score}%` }}
                                        />
                                    </div>
                                </div>
                                <p className="text-sm text-neutral-300">{selectedFeedback.feedback}</p>
                                {selectedFeedback.covered.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-green-400 mb-1">✅ Covered</p>
                                        <ul className="text-sm text-neutral-400 space-y-1">
                                            {selectedFeedback.covered.map((c, i) => <li key={i}>• {c}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {selectedFeedback.missing.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-red-400 mb-1">❌ Missing</p>
                                        <ul className="text-sm text-neutral-400 space-y-1">
                                            {selectedFeedback.missing.map((m, i) => <li key={i}>• {m}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Upload Area */}
                        <div className="min-h-[300px] border-2 border-dashed border-neutral-800 rounded-3xl p-6 flex flex-col relative bg-neutral-900/20">
                            <input type="file" accept="image/*" multiple className="hidden" ref={galleryInputRef} onChange={handleFileChange} />

                            {files.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center">
                                        <Smartphone className="w-8 h-8 text-neutral-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">Capture Notes</h3>
                                        <p className="text-neutral-500 text-sm">Take photos of your handwritten notes</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-20">
                                    {previews.map((src, idx) => (
                                        <div key={idx} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-neutral-800">
                                            <Image src={src} alt="preview" fill className="object-cover" />
                                            <button
                                                onClick={() => removeFile(idx)}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-full text-white"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white/80">
                                                PG {idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => setShowSourceMenu(true)}
                                        className="aspect-[3/4] rounded-xl border-2 border-dashed border-neutral-800 flex items-center justify-center hover:bg-neutral-800/30"
                                    >
                                        <Plus className="w-8 h-8 text-neutral-600" />
                                    </button>
                                </div>
                            )}

                            {/* Floating Actions */}
                            <div className="absolute bottom-6 right-6 left-6 flex justify-end gap-4 pointer-events-none">
                                <button
                                    onClick={() => setShowSourceMenu(!showSourceMenu)}
                                    className="pointer-events-auto h-14 w-14 rounded-full bg-white text-black shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-20"
                                >
                                    <Plus className={`w-7 h-7 transition-transform ${showSourceMenu ? "rotate-45" : ""}`} />
                                </button>

                                {showSourceMenu && (
                                    <div className="pointer-events-auto absolute bottom-18 right-0 p-2 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col gap-2 min-w-[180px] z-20">
                                        <button
                                            onClick={startCamera}
                                            className="flex items-center gap-3 w-full p-3 hover:bg-neutral-800 rounded-xl transition-colors"
                                        >
                                            <Camera className="w-5 h-5 text-purple-400" />
                                            <span className="text-white text-sm">Camera</span>
                                        </button>
                                        <button
                                            onClick={() => galleryInputRef.current?.click()}
                                            className="flex items-center gap-3 w-full p-3 hover:bg-neutral-800 rounded-xl transition-colors"
                                        >
                                            <FileText className="w-5 h-5 text-blue-400" />
                                            <span className="text-white text-sm">Gallery</span>
                                        </button>
                                    </div>
                                )}

                                {files.length > 0 && (
                                    <button
                                        onClick={handleUpload}
                                        disabled={uploading}
                                        className="pointer-events-auto flex-1 md:flex-none md:w-auto px-6 h-14 rounded-full bg-purple-600 text-white shadow-xl flex items-center justify-center gap-2 font-semibold hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50 z-10"
                                    >
                                        {uploading ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
                                        ) : (
                                            <><Upload className="w-5 h-5" /> Submit Notes <span className="bg-purple-700 px-2 py-0.5 rounded text-sm ml-1">{files.length}</span></>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Logs */}
                        {logs.length > 0 && (
                            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 max-h-40 overflow-y-auto space-y-1">
                                {logs.map((log, i) => (
                                    <div key={i} className="text-sm font-mono text-neutral-400">{log}</div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Camera Overlay */}
            {showCamera && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <div className="relative flex-1 overflow-hidden flex items-center justify-center">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute top-4 right-4">
                            <button onClick={stopCamera} className="p-2 rounded-full bg-black/50 text-white backdrop-blur-md">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="absolute bottom-8 inset-x-0 flex justify-center">
                            <button
                                onClick={capturePhoto}
                                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                            >
                                <div className="w-16 h-16 rounded-full bg-white" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Source menu backdrop */}
            {showSourceMenu && (
                <div className="fixed inset-0 z-10" onClick={() => setShowSourceMenu(false)} />
            )}
        </div>
    );
}
