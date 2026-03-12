"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
    LogOut, BookOpen, Upload, X, Plus, Loader2, FileText,
    ChevronLeft, Check, Trash2, Eye, EyeOff, Atom,
    FlaskConical, Calculator, Mic, Users, BarChart3, TrendingUp, AlertCircle
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { SUBJECTS, CLASSES } from "@/lib/types";

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
    content: string;
    recording_file_id: string | null;
    published: boolean;
    created_at: string;
}

interface Submission {
    id: string;
    student_name: string;
    student_email: string;
    match_score: number | null;
    ocr_status: string;
    ai_feedback: string;
    created_at: string;
}

type View = "subjects" | "lectures" | "new-lecture" | "submissions";

export function TeacherDashboard() {
    const { data: session } = useSession();

    const [view, setView] = useState<View>("subjects");
    const [selectedSubject, setSelectedSubject] = useState<string>("");
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [loading, setLoading] = useState(false);

    // New lecture form
    const [title, setTitle] = useState("");
    const [targetClass, setTargetClass] = useState<string>("");
    const [transcript, setTranscript] = useState("");
    const [recordingFile, setRecordingFile] = useState<File | null>(null);
    const [transcribing, setTranscribing] = useState(false);
    const [saving, setSaving] = useState(false);
    const recordingInputRef = useRef<HTMLInputElement>(null);

    // Submissions
    const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(false);
    const [insights, setInsights] = useState<any>(null);

    const fetchLectures = async (subject: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/lectures?subject=${subject}`);
            const data = await res.json();
            setLectures(data.lectures || []);
        } catch {
            setLectures([]);
        }
        setLoading(false);
    };

    const openSubject = (subject: string) => {
        setSelectedSubject(subject);
        setView("lectures");
        fetchLectures(subject);
    };

    const openNewLecture = () => {
        setTitle("");
        setTargetClass("");
        setTranscript("");
        setRecordingFile(null);
        setView("new-lecture");
    };

    const handleRecordingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRecordingFile(file);

        // Upload to Drive first, then transcribe
        setTranscribing(true);
        try {
            // Upload recording to Drive
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

            // Transcribe
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

    const saveLecture = async (publish: boolean) => {
        if (!title || !targetClass || !transcript) {
            alert("Please fill in all fields");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/lectures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    subject: selectedSubject,
                    class: targetClass,
                    content: transcript,
                }),
            });
            const data = await res.json();

            if (res.ok && publish) {
                // Publish immediately
                await fetch("/api/lectures", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: data.lecture.id, published: true }),
                });
            }

            if (res.ok) {
                setView("lectures");
                fetchLectures(selectedSubject);
            } else {
                alert("Error: " + data.error);
            }
        } catch (err: any) {
            alert("Error: " + err.message);
        }
        setSaving(false);
    };

    const togglePublish = async (lecture: Lecture) => {
        try {
            await fetch("/api/lectures", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: lecture.id, published: !lecture.published }),
            });
            fetchLectures(selectedSubject);
        } catch { }
    };

    const deleteLecture = async (id: string) => {
        if (!confirm("Delete this lecture?")) return;
        try {
            await fetch(`/api/lectures?id=${id}`, { method: "DELETE" });
            fetchLectures(selectedSubject);
        } catch { }
    };

    const viewSubmissions = async (lecture: Lecture) => {
        setSelectedLecture(lecture);
        setView("submissions");
        setLoadingSubs(true);
        setInsights(null);
        try {
            // Fetch individual submissions
            const res = await fetch(`/api/submissions?lecture_id=${lecture.id}`);
            const data = await res.json();
            setSubmissions(data.submissions || []);

            // Fetch class insights
            const insRes = await fetch(`/api/submissions/insights?lecture_id=${lecture.id}`);
            if (insRes.ok) {
                const insData = await insRes.json();
                setInsights(insData);
            }
        } catch {
            setSubmissions([]);
        }
        setLoadingSubs(false);
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
                                    if (view === "new-lecture" || view === "submissions") {
                                        setView("lectures");
                                    } else {
                                        setView("subjects");
                                        setSelectedSubject("");
                                    }
                                }}
                                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                                {session?.user?.name?.[0] || "T"}
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm">{session?.user?.name}</p>
                                <p className="text-xs text-neutral-500">Teacher</p>
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
                                        className="group p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all text-left hover:shadow-lg hover:shadow-blue-500/5"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                                            <Icon className="w-6 h-6 text-blue-400" />
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
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-white">{selectedSubject}</h2>
                            <button
                                onClick={openNewLecture}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                New Lecture
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                            </div>
                        ) : lectures.length === 0 ? (
                            <div className="text-center py-16 space-y-3">
                                <BookOpen className="w-12 h-12 text-neutral-600 mx-auto" />
                                <p className="text-neutral-400">No lectures yet</p>
                                <p className="text-sm text-neutral-600">Upload a lecture recording to get started.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {lectures.map((lec) => (
                                    <div
                                        key={lec.id}
                                        className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-semibold text-white">{lec.title}</h3>
                                                <p className="text-xs text-neutral-500 mt-1">
                                                    Class {lec.class} • {new Date(lec.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <span
                                                className={`text-xs px-2 py-1 rounded-lg font-medium ${lec.published
                                                    ? "bg-green-500/10 text-green-400"
                                                    : "bg-neutral-800 text-neutral-400"
                                                    }`}
                                            >
                                                {lec.published ? "Published" : "Draft"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => togglePublish(lec)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${lec.published
                                                    ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                                                    : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                                    }`}
                                            >
                                                {lec.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                {lec.published ? "Unpublish" : "Publish"}
                                            </button>
                                            <button
                                                onClick={() => viewSubmissions(lec)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                                            >
                                                <Users className="w-3.5 h-3.5" />
                                                View Notes
                                            </button>
                                            <button
                                                onClick={() => deleteLecture(lec.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* NEW LECTURE VIEW */}
                {view === "new-lecture" && (
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
                                    onClick={() => saveLecture(false)}
                                    disabled={saving || !title || !targetClass || !transcript}
                                    className="flex-1 py-3 rounded-xl bg-neutral-800 text-white font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                                >
                                    Save as Draft
                                </button>
                                <button
                                    onClick={() => saveLecture(true)}
                                    disabled={saving || !title || !targetClass || !transcript}
                                    className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                    Publish
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* SUBMISSIONS VIEW */}
                {view === "submissions" && selectedLecture && (
                    <>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{selectedLecture.title}</h2>
                            <p className="text-sm text-neutral-500">Class {selectedLecture.class} • Student Submissions</p>
                        </div>

                        {loadingSubs ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                            </div>
                        ) : submissions.length === 0 ? (
                            <div className="text-center py-16 space-y-3">
                                <Users className="w-12 h-12 text-neutral-600 mx-auto" />
                                <p className="text-neutral-400">No submissions yet</p>
                                <p className="text-sm text-neutral-600">
                                    {selectedLecture.published
                                        ? "Students haven't uploaded notes yet."
                                        : "Publish this lecture to allow student submissions."}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Insights Panel */}
                                {insights && (
                                    <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                                                <TrendingUp className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">Class Insights</h3>
                                                <p className="text-xs text-neutral-400">AI-generated summary of class performance</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {/* Left: Score Distribution */}
                                            <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800">
                                                <div className="flex justify-between items-end mb-4">
                                                    <span className="text-sm text-neutral-400">Average Score</span>
                                                    <span className={`text-2xl font-bold ${insights.averageScore >= 80 ? 'text-green-400' :
                                                            insights.averageScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                                                        }`}>{insights.averageScore}%</span>
                                                </div>
                                                <div className="h-32 w-full text-xs">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={insights.scoreDistribution} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                                                            <XAxis dataKey="range" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                                                            <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                                                            <Tooltip
                                                                cursor={{ fill: '#262626' }}
                                                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', color: '#fff' }}
                                                            />
                                                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>

                                            {/* Right: Most Missed Concepts */}
                                            <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 text-orange-400" />
                                                    <span className="text-sm font-semibold text-white">Most Missed Concepts</span>
                                                </div>
                                                <p className="text-xs text-neutral-300 leading-relaxed">
                                                    {insights.missedConceptsSummary}
                                                </p>
                                                {insights.missingTopicsList?.length > 0 && (
                                                    <ul className="text-xs text-neutral-400 space-y-1 mt-2">
                                                        {insights.missingTopicsList.map((topic: string, i: number) => (
                                                            <li key={i} className="flex gap-2">
                                                                <span className="text-orange-500/50">•</span>
                                                                {topic}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <h3 className="text-sm font-semibold text-neutral-400 mb-3 px-1">Individual Submissions</h3>
                                    <div className="space-y-3">
                                        {submissions.map((sub) => {
                                            let feedback: any = null;
                                            try { feedback = sub.ai_feedback ? JSON.parse(sub.ai_feedback) : null; } catch { }

                                            return (
                                                <div key={sub.id} className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                                                {sub.student_name?.[0] || "?"}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">{sub.student_name}</p>
                                                                <p className="text-xs text-neutral-500">{new Date(sub.created_at).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>
                                                        {sub.ocr_status === "completed" && sub.match_score != null ? (
                                                            <span className={`text-lg font-bold px-3 py-1 rounded-xl ${sub.match_score >= 80 ? "bg-green-500/10 text-green-400" :
                                                                sub.match_score >= 50 ? "bg-yellow-500/10 text-yellow-400" :
                                                                    "bg-red-500/10 text-red-400"
                                                                }`}>
                                                                {sub.match_score}%
                                                            </span>
                                                        ) : sub.ocr_status === "processing" ? (
                                                            <span className="text-xs text-neutral-500 flex items-center gap-1">
                                                                <Loader2 className="w-3 h-3 animate-spin" /> Processing
                                                            </span>
                                                        ) : sub.ocr_status === "failed" ? (
                                                            <span className="text-xs text-red-400">Failed</span>
                                                        ) : (
                                                            <span className="text-xs text-neutral-500">Pending</span>
                                                        )}
                                                    </div>

                                                    {feedback && (
                                                        <div className="space-y-2 pt-2 border-t border-neutral-800">
                                                            {/* Score bar */}
                                                            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${feedback.score >= 80 ? "bg-green-500" :
                                                                        feedback.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                                        }`}
                                                                    style={{ width: `${feedback.score}%` }}
                                                                />
                                                            </div>
                                                            <p className="text-xs text-neutral-400">{feedback.feedback}</p>
                                                            <div className="flex gap-4 text-xs">
                                                                {feedback.covered?.length > 0 && (
                                                                    <div>
                                                                        <span className="text-green-400">✅ {feedback.covered.length} covered</span>
                                                                    </div>
                                                                )}
                                                                {feedback.missing?.length > 0 && (
                                                                    <div>
                                                                        <span className="text-red-400">❌ {feedback.missing.length} missing</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
