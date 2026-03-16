"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut, ChevronLeft } from "lucide-react";
import { Lecture, Submission } from "./dashboard/types";
import { SubjectsView } from "./dashboard/SubjectsView";
import { LecturesView } from "./dashboard/LecturesView";
import { NewLectureView } from "./dashboard/NewLectureView";
import { SubmissionsView } from "./dashboard/SubmissionsView";

type View = "subjects" | "lectures" | "new-lecture" | "submissions";

export function TeacherDashboard() {
    const { data: session } = useSession();

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
                }),
            });
            const resData = await res.json();

            if (res.ok && publish) {
                await fetch("/api/lectures", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: resData.lecture.id, published: true }),
                });
            }

            if (res.ok) {
                setView("lectures");
                fetchLectures(selectedSubject);
            } else {
                alert("Error: " + resData.error);
            }
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
            </div>
        </div>
    );
}
