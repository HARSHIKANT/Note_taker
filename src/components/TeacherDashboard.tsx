"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut, ChevronLeft, BarChart2, BookMarked, Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { Lecture, Submission } from "./dashboard/types";
import { SubjectsView } from "./dashboard/SubjectsView";
import { LecturesView } from "./dashboard/LecturesView";
import { NewLectureView } from "./dashboard/NewLectureView";
import { SubmissionsView } from "./dashboard/SubmissionsView";
import { TeacherAnalyticsView } from "./dashboard/TeacherAnalyticsView";
import { HeadTeacherAnalyticsView } from "./dashboard/HeadTeacherAnalyticsView";
import ApiKeyModal from "./ApiKeyModal";
import type { ExtendedSession } from "@/lib/types";

type View = "subjects" | "lectures" | "new-lecture" | "submissions" | "analytics" | "courses";

export function TeacherDashboard() {
    const { data: session, update } = useSession();
    const extSession = session as unknown as ExtendedSession;
    const isHeadTeacher = extSession?.isHeadTeacher ?? false;
    const hasApiKey = !!extSession?.geminiApiKey;

    const [view, setView] = useState<View>("subjects");
    const [selectedSubject, setSelectedSubject] = useState<string>("");
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null); // null = subject mode

    // Course Manager State (Head Teacher only)
    const [courseList, setCourseList] = useState<{ id: string; name: string }[]>([]);
    const [newCourseName, setNewCourseName] = useState("");
    const [savingCourse, setSavingCourse] = useState(false);
    const [coursesLoaded, setCoursesLoaded] = useState(false);

    const fetchCourseList = async () => {
        const r = await fetch("/api/courses");
        const d = await r.json();
        setCourseList(d.courses ?? []);
        setCoursesLoaded(true);
    };

    const handleOpenCourses = () => {
        setView("courses");
        if (!coursesLoaded) fetchCourseList();
    };

    const handleCreateCourse = async () => {
        if (!newCourseName.trim()) return;
        setSavingCourse(true);
        const res = await fetch("/api/courses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newCourseName.trim() }),
        });
        if (res.ok) { setNewCourseName(""); fetchCourseList(); }
        else { const d = await res.json(); alert(d.error); }
        setSavingCourse(false);
    };

    const handleDeleteCourse = async (id: string) => {
        if (!confirm("Delete this course? Students enrolled will no longer see it.")) return;
        await fetch(`/api/courses?id=${id}`, { method: "DELETE" });
        fetchCourseList();
    };

    // Lectures State
    const [lectures, setLectures] = useState<Lecture[]>([]);
    const [loadingLectures, setLoadingLectures] = useState(false);

    // Submissions State
    const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loadingSubs, setLoadingSubs] = useState(false);
    const [insights, setInsights] = useState<any>(null);
    const [insightsLastGeneratedAt, setInsightsLastGeneratedAt] = useState<string | null>(null);
    const [aiDetectionInsights, setAiDetectionInsights] = useState<any>(null);

    const fetchLectures = async (subject: string, courseId?: string) => {
        setLoadingLectures(true);
        try {
            const url = courseId
                ? `/api/lectures?course_id=${courseId}`
                : `/api/lectures?subject=${subject}`;
            const res = await fetch(url);
            const data = await res.json();
            setLectures(data.lectures || []);
        } catch {
            setLectures([]);
        }
        setLoadingLectures(false);
    };

    const openSubject = (subject: string) => {
        setSelectedSubject(subject);
        setSelectedCourseId(null);
        setView("lectures");
        fetchLectures(subject);
    };

    const openCourse = (course: { id: string; name: string }) => {
        setSelectedSubject(course.name);
        setSelectedCourseId(course.id);
        setView("lectures");
        fetchLectures(course.name, course.id);
    };

    const saveLecture = async (
        data: { title: string; targetClass: string; transcript: string; courseId?: string },
        publish: boolean
    ) => {
        try {
            // If currently in a course context, always use the selectedCourseId
            const effectiveCourseId = selectedCourseId ?? data.courseId;
            const res = await fetch("/api/lectures", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: data.title,
                    subject: effectiveCourseId ? undefined : selectedSubject,
                    class: effectiveCourseId ? undefined : data.targetClass,
                    course_id: effectiveCourseId || undefined,
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
            fetchLectures(selectedSubject, selectedCourseId ?? undefined);
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
            fetchLectures(selectedSubject, selectedCourseId ?? undefined);
        } catch { }
    };

    const deleteLecture = async (id: string) => {
        if (!confirm("Delete this lecture?")) return;
        try {
            await fetch(`/api/lectures?id=${id}`, { method: "DELETE" });
            fetchLectures(selectedSubject, selectedCourseId ?? undefined);
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
                setInsights(insData.insights ?? null);
                setInsightsLastGeneratedAt(insData.insights_last_generated_at ?? null);
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
                        {/* Course Manager — Head Teacher only */}
                        {isHeadTeacher && (
                            <button
                                onClick={handleOpenCourses}
                                className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg transition-colors text-sm font-medium ${view === "courses"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : "hover:bg-blue-500/10 text-blue-500 hover:text-blue-400"
                                    }`}
                            >
                                <BookMarked className="w-5 h-5" />
                                <span className="hidden sm:inline">Courses</span>
                            </button>
                        )}
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
                    <SubjectsView
                        onSelectSubject={openSubject}
                        onSelectCourse={openCourse}
                    />
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
                        geminiApiKey={extSession?.geminiApiKey ?? ""}
                        isCourseMode={!!selectedCourseId}
                    />
                )}

                {view === "submissions" && selectedLecture && (
                    <SubmissionsView
                        lecture={selectedLecture}
                        submissions={submissions}
                        loadingSubs={loadingSubs}
                        insights={insights}
                        insightsLastGeneratedAt={insightsLastGeneratedAt}
                        aiDetectionInsights={aiDetectionInsights}
                    />
                )}

                {view === "analytics" && (
                    isHeadTeacher
                        ? <HeadTeacherAnalyticsView myId={(session as any)?.userId ?? ""} />
                        : <TeacherAnalyticsView isHeadTeacher={false} />
                )}

                {/* Course Manager view — Head Teacher only */}
                {view === "courses" && isHeadTeacher && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl lg:text-3xl font-bold text-white">Course Manager</h2>
                            <p className="text-sm text-neutral-400 mt-1">Create courses for students to enroll in at sign-up</p>
                        </div>
                        <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                            <div className="flex gap-3">
                                <input
                                    value={newCourseName}
                                    onChange={(e) => setNewCourseName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreateCourse()}
                                    placeholder='e.g. "Web Development 101"'
                                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />
                                <button
                                    onClick={handleCreateCourse}
                                    disabled={savingCourse || !newCourseName.trim()}
                                    className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
                                >
                                    {savingCourse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Create Course
                                </button>
                            </div>

                            {courseList.length === 0 ? (
                                <div className="text-center py-10 space-y-3">
                                    <BookOpen className="w-10 h-10 text-neutral-600 mx-auto" />
                                    <p className="text-neutral-400">No courses yet. Create your first one above.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {courseList.map((course) => (
                                        <div key={course.id} className="flex items-center justify-between p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                    <BookOpen className="w-4 h-4 text-blue-400" />
                                                </div>
                                                <span className="text-white font-medium">{course.name}</span>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteCourse(course.id)}
                                                className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
