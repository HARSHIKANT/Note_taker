"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut, ChevronLeft, BarChart2 } from "lucide-react";
import { Lecture, Submission } from "./dashboard/types";
import { SubjectsView } from "./dashboard/SubjectsView";
import { LecturesView } from "./dashboard/LecturesView";
import { NewLectureView } from "./dashboard/NewLectureView";
import { SubmissionsView } from "./dashboard/SubmissionsView";
import { TeacherAnalyticsView } from "./dashboard/TeacherAnalyticsView";
import { HeadTeacherAnalyticsView } from "./dashboard/HeadTeacherAnalyticsView";
import ApiKeyModal from "./ApiKeyModal";
import type { ExtendedSession } from "@/lib/types";

type View = "subjects" | "lectures" | "new-lecture" | "submissions" | "analytics";

export function TeacherDashboard() {
    const { data: session, update } = useSession();
    const extSession = session as unknown as ExtendedSession;
    const isHeadTeacher = extSession?.isHeadTeacher ?? false;
    const hasApiKey = !!extSession?.geminiApiKey;

    const [view, setView] = useState<View>("subjects");
    const [selectedSubject, setSelectedSubject] = useState<string>("");

    // Lectures State
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [loadingLectures, setLoadingLectures] = useState(false);

    // Submissions State
    const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(false);
    const [insights, setInsights] = useState<any>(null);
    const [aiDetectionInsights, setAiDetectionInsights] = useState<any>(null);

    const fetchLectures = async (subject: string) => {
        setLoadingLectures(true);
        try {
            const res = await fetch(`/api/lectures?subject=${subject}`);
            const data = await res.json();
            setLectures(data.lectures || []);
        } catch {
            setLectures([]);
        }
        setLoadingLectures(false);
    };

    const openSubject = (subject: string) => {
        setSelectedSubject(subject);
        setView("lectures");
        fetchLectures(subject);
    };

    const saveLecture = async (
        data: { title: string; targetClass: string; transcript: string },
        publish: boolean
    ) => {
        try {
            const res = await fetch("/api/lectures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: data.title,
                    subject: selectedSubject,
                    class: data.targetClass,
                    content: data.transcript,
                    audio_insights: null,
                }),
            });
            const resData = await res.json();

            if (!res.ok) {
                alert("Error: " + resData.error);
                return;
            }

            const lectureId = resData.lecture?.id;

            // Publish
            if (publish && lectureId) {
                await fetch("/api/lectures", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: lectureId, published: true }),
                });

                // Auto-analyse transcript in the background (no await — don't block the user)
                fetch("/api/lectures/analyze-text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ transcript: data.transcript, lectureId }),
                }).catch((err) => console.error("[Analytics] Auto-analysis failed:", err));
            }

            setView("lectures");
            fetchLectures(selectedSubject);
        } catch (err: any) {
            alert("Error: " + err.message);
        }
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
            const res = await fetch(`/api/submissions?lecture_id=${lecture.id}`);
            const data = await res.json();
            setSubmissions(data.submissions || []);
            setAiDetectionInsights(data.ai_detection_insights ?? null);

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
            {/* API Key Modal — shown until teacher provides their key */}
            {!hasApiKey && <ApiKeyModal onSaved={() => update()} />}
            {/* Header */}
            <div className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur-xl border-b border-neutral-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 lg:py-4 flex items-center justify-between">
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
                            <div className={`w-10 h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center text-white font-bold text-base ${isHeadTeacher
                                ? "bg-gradient-to-tr from-amber-400 to-orange-500 shadow-md shadow-amber-500/30"
                                : "bg-gradient-to-tr from-blue-500 to-cyan-500"
                                }`}>
                                {extSession?.user?.name?.[0] || "T"}
                            </div>
                            <div>
                                <p className="font-semibold text-white text-sm lg:text-base flex items-center gap-1.5">
                                    {extSession?.user?.name}
                                    {isHeadTeacher && (
                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded-full">HEAD</span>
                                    )}
                                </p>
                                <p className="text-xs lg:text-sm text-neutral-400">{isHeadTeacher ? "Head Teacher" : "Teacher"}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setView(view === "analytics" ? "subjects" : "analytics")}
                            className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg transition-colors text-sm font-medium ${view === "analytics"
                                ? isHeadTeacher ? "bg-amber-500/20 text-amber-400" : "bg-blue-600 text-white"
                                : isHeadTeacher ? "hover:bg-amber-500/10 text-amber-600 hover:text-amber-400" : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                                }`}
                        >
                            <BarChart2 className="w-5 h-5" />
                            <span className="hidden sm:inline">Analytics</span>
                        </button>
                        <button
                            onClick={() => signOut()}
                            className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-6">
                {view === "subjects" && (
                    <SubjectsView onSelectSubject={openSubject} />
                )}

                {view === "lectures" && (
                    <LecturesView
                        selectedSubject={selectedSubject}
                        lectures={lectures}
                        loading={loadingLectures}
                        onNewLecture={() => setView("new-lecture")}
                        onTogglePublish={togglePublish}
                        onViewSubmissions={viewSubmissions}
                        onDeleteLecture={deleteLecture}
                    />
                )}

                {view === "new-lecture" && (
                    <NewLectureView
                        selectedSubject={selectedSubject}
                        onSave={saveLecture}
                    />
                )}

                {view === "submissions" && selectedLecture && (
                    <SubmissionsView
                        lecture={selectedLecture}
                        submissions={submissions}
                        loadingSubs={loadingSubs}
                        insights={insights}
                        aiDetectionInsights={aiDetectionInsights}
                    />
                )}

                {view === "analytics" && (
                    isHeadTeacher
                        ? <HeadTeacherAnalyticsView myId={(session as any)?.userId ?? ""} />
                        : <TeacherAnalyticsView isHeadTeacher={false} />
                )}
            </div>
        </div>
    );
}
