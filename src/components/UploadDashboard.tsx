
"use client";

import { useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { Upload, X, Plus, Check, Loader2, LogOut, FileText, Smartphone, ChevronDown, Camera, SwitchCamera } from "lucide-react";
import Image from "next/image";

const SUBJECTS = ["Physics", "Chemistry", "Biology", "Maths", "English", "CS"];

export function UploadDashboard() {
    const { data: session } = useSession();
    const [subject, setSubject] = useState(SUBJECTS[0]);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [previews, setPreviews] = useState<string[]>([]);
    const [logs, setLogs] = useState<string[]>([]); // To show success messages

    const [showSourceMenu, setShowSourceMenu] = useState(false);

    // Camera State
    const [showCamera, setShowCamera] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" } // Prefer back camera
            });
            setCameraStream(stream);
            setShowCamera(true);
            setShowSourceMenu(false);
            // Wait for render
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 100);
        } catch (err) {
            console.error("Camera access denied:", err);
            alert("Could not access camera. Please check permissions.");
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setShowCamera(false);
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to File
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
                    setFiles(prev => [...prev, file]);
                    setPreviews(prev => [...prev, URL.createObjectURL(file)]);
                }
            }, 'image/jpeg', 0.8);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setFiles((prev) => [...prev, ...newFiles]);

            // Create previews
            const newPreviews = newFiles.map(file => URL.createObjectURL(file));
            setPreviews((prev) => [...prev, ...newPreviews]);
        }
        setShowSourceMenu(false);
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
        setPreviews((prev) => {
            // Revoke the URL to avoid memory leaks
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setUploading(true);
        setLogs([]);

        const formData = new FormData();
        formData.append("subject", subject);
        files.forEach(file => {
            formData.append("files", file); // key 'files' matches backend expectation
        });

        try {
            const res = await fetch("/api/bulk-upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (res.ok) {
                // Handle batched response
                data.results.forEach((r: any) => {
                    if (r.status === "success") {
                        setLogs(prev => [...prev, `✅ Uploaded ${r.name}`]);
                    } else {
                        setLogs(prev => [...prev, `❌ Failed ${r.name}: ${r.error}`]);
                    }
                });

                // Clear successfully uploaded files?
                // For now, if all succeeded, we might want to clear the list.
                if (data.failCount === 0) {
                    setFiles([]);
                    setPreviews([]);
                    setLogs(prev => [...prev, "🎉 All files uploaded successfully!"]);
                }
            } else {
                setLogs(prev => [...prev, `❌ Bulk Upload Failed: ${data.error}`]);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ Network Error: ${err.message}`]);
        }

        setUploading(false);
    };


    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4 md:p-8 font-sans">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-center bg-neutral-900/50 p-4 rounded-xl border border-neutral-800 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                            {session?.user?.name?.[0] || "U"}
                        </div>
                        <div>
                            <p className="text-sm text-neutral-400">Welcome,</p>
                            <p className="font-semibold text-white">{session?.user?.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
                        title="Sign Out"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>

                {/* Dashboard Content */}
                <div className="grid gap-6">

                    {/* 1. Subject Selector */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-neutral-400">Select Subject</label>
                        <div className="relative group">
                            <select
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full appearance-none bg-neutral-900 border border-neutral-800 text-white rounded-xl px-4 py-3 pr-0 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all cursor-pointer hover:border-neutral-700"
                            >
                                {SUBJECTS.map((sub) => (
                                    <option key={sub} value={sub} className="bg-neutral-900 text-white">
                                        {sub}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 2. Upload Area */}
                    <div className="min-h-[400px] border-2 border-dashed border-neutral-800 rounded-3xl p-6 flex flex-col relative bg-neutral-900/20">
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            ref={cameraInputRef}
                            onChange={handleFileChange}
                        />
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            ref={galleryInputRef}
                            onChange={handleFileChange}
                        />

                        {files.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-20 h-20 rounded-full bg-neutral-800/50 flex items-center justify-center animate-pulse">
                                    <Smartphone className="w-10 h-10 text-neutral-500" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-semibold text-white">Capture Notes</h3>
                                    <p className="text-neutral-500 max-w-xs mx-auto">
                                        Tap the + button to snap photos of your {subject} notes.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-20">
                                {previews.map((src, idx) => (
                                    <div key={idx} className="relative aspect-[3/4] group rounded-xl overflow-hidden shadow-2xl border border-neutral-800">
                                        <Image src={src} alt="preview" fill className="object-cover" />
                                        <button
                                            onClick={() => removeFile(idx)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500/80 backdrop-blur-md rounded-full text-white transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs font-mono text-white/80">
                                            PG {idx + 1}
                                        </div>
                                    </div>
                                ))}
                                {/* Ghost card for adding more */}
                                <button
                                    onClick={() => setShowSourceMenu(true)}
                                    className="aspect-[3/4] rounded-xl border-2 border-dashed border-neutral-800 flex items-center justify-center hover:bg-neutral-800/30 transition-colors group"
                                >
                                    <Plus className="w-8 h-8 text-neutral-600 group-hover:text-neutral-400" />
                                </button>
                            </div>
                        )}

                        {/* Floating Actions */}
                        <div className="absolute bottom-6 right-6 left-6 flex justify-end gap-4 pointer-events-none">
                            <button
                                onClick={() => setShowSourceMenu(!showSourceMenu)}
                                className="pointer-events-auto h-16 w-16 rounded-full bg-white text-black shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-20"
                            >
                                <Plus className={`w-8 h-8 transition-transform duration-300 ${showSourceMenu ? 'rotate-45' : ''}`} />
                            </button>

                            {/* Source Menu */}
                            {showSourceMenu && (
                                <div className="pointer-events-auto absolute bottom-20 right-0 p-2 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col gap-2 min-w-[200px] animate-in slide-in-from-bottom-5 z-20">
                                    <button
                                        onClick={startCamera}
                                        className="flex items-center gap-3 w-full p-3 hover:bg-neutral-800 rounded-xl transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                                            <Smartphone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">Camera</p>
                                            <p className="text-xs text-neutral-400">Take a photo</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => galleryInputRef.current?.click()}
                                        className="flex items-center gap-3 w-full p-3 hover:bg-neutral-800 rounded-xl transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">Gallery</p>
                                            <p className="text-xs text-neutral-400">Choose from files</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {files.length > 0 && (
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="pointer-events-auto flex-1 md:flex-none md:w-auto px-8 h-16 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center gap-2 font-semibold hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none z-10"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Uploading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-5 h-5" />
                                            <span>Save to Drive</span>
                                            <span className="bg-blue-700 px-2 py-0.5 rounded text-sm ml-1">{files.length}</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Logs Area */}
                    {logs.length > 0 && (
                        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 max-h-40 overflow-y-auto space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className="text-sm font-mono text-neutral-400">{log}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {/* Camera Overlay */}
            {showCamera && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col">
                    <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <canvas ref={canvasRef} className="hidden" />

                        {/* Camera Controls */}
                        <div className="absolute top-4 right-4 z-10">
                            <button
                                onClick={stopCamera}
                                className="p-2 rounded-full bg-black/50 text-white backdrop-blur-md"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="absolute bottom-8 inset-x-0 flex items-center justify-center gap-8 pb-safe">
                            <button
                                onClick={capturePhoto}
                                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                            >
                                <div className="w-16 h-16 rounded-full bg-white" />
                            </button>
                        </div>

                        {/* Just a small hint or recent preview could go here if we wanted complexity */}
                    </div>
                </div>
            )}

            {/* Backdrop for menu */}
            {showSourceMenu && (
                <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSourceMenu(false)}
                />
            )}
        </div>
    );
}
