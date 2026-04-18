"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { GraduationCap, BookMarked, BookOpen, Atom, FlaskConical, Calculator, Check, Loader2, ArrowRight } from "lucide-react";
import { CLASSES, SUBJECTS } from "@/lib/types";
import type { ExtendedSession } from "@/lib/types";

interface Course {
    id: string;
    name: string;
}

const SUBJECT_ICONS: Record<string, any> = {
    Physics: Atom,
    Chemistry: FlaskConical,
    Math: Calculator,
    default: BookOpen,
};

export default function RoleSelectPage() {
    const { data: session, update } = useSession();
    const extSession = session as unknown as ExtendedSession;
    const router = useRouter();

    const role = extSession?.role;

    const [selectedClass, setSelectedClass] = useState<string>("");
    const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoadingCourses(true);
        fetch("/api/courses")
            .then((r) => r.json())
            .then((d) => setCourses(d.courses ?? []))
            .catch(() => setError("Could not load courses"))
            .finally(() => setLoadingCourses(false));
    }, []);

    const toggleItem = <T extends string>(arr: T[], item: T): T[] =>
        arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

    const canSubmit = () => {
        if (role === "student") return !!selectedClass || selectedCourses.length > 0;
        if (role === "teacher") return selectedSubjects.length > 0 || selectedCourses.length > 0;
        return false;
    };

    const handleSubmit = async () => {
        if (!canSubmit()) return;
        setLoading(true);
        setError("");

        try {
            const body: Record<string, unknown> = {};
            if (role === "student") {
                if (selectedClass) body.class = selectedClass;
                if (selectedCourses.length > 0) body.enrolled_courses = selectedCourses;
            }
            if (role === "teacher") {
                if (selectedSubjects.length > 0) body.assigned_subjects = selectedSubjects;
                if (selectedCourses.length > 0) body.enrolled_courses = selectedCourses;
            }

            const res = await fetch("/api/user/role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Something went wrong"); setLoading(false); return; }

            // Refresh JWT so StudentDashboard reads the new class/subjects immediately
            await update();
            // page.tsx reads from DB, so the redirect loop cannot return
            router.push("/");

        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden py-10">
            {/* Background gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse" />
            </div>

            <div className="z-10 max-w-lg w-full px-6 space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                        Set Up Your Profile
                    </h1>
                    <p className="text-gray-400 text-lg">
                        {role === "teacher"
                            ? "Choose the subjects and/or courses you teach."
                            : "Choose your class and/or custom courses."}
                    </p>
                    <p className="text-xs text-gray-600">You can select one or both — they'll appear side-by-side in your dashboard.</p>
                </div>

                <div className="space-y-6">
                    {/* ── STUDENT: Class Picker ── */}
                    {role === "student" && (
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                <GraduationCap className="w-4 h-4 text-purple-400" />
                                Select Your Class (optional)
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {CLASSES.map((cls) => (
                                    <button
                                        key={cls}
                                        onClick={() => { setSelectedClass(selectedClass === cls ? "" : cls); setError(""); }}
                                        className={`py-3 rounded-xl text-lg font-semibold transition-all ${selectedClass === cls
                                            ? "bg-purple-500 text-white shadow-lg"
                                            : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"}`}
                                    >
                                        Class {cls}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── TEACHER: Subjects Multi-Select ── */}
                    {role === "teacher" && (
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-blue-400" />
                                Select Subjects You Teach (optional)
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {SUBJECTS.map((sub) => {
                                    const Icon = SUBJECT_ICONS[sub] || BookOpen;
                                    const selected = selectedSubjects.includes(sub);
                                    return (
                                        <button
                                            key={sub}
                                            onClick={() => { setSelectedSubjects(toggleItem(selectedSubjects, sub)); setError(""); }}
                                            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${selected
                                                ? "border-blue-500 bg-blue-500/10"
                                                : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                                        >
                                            <Icon className={`w-5 h-5 ${selected ? "text-blue-400" : "text-gray-500"}`} />
                                            <span className="font-semibold text-white text-sm">{sub}</span>
                                            {selected && <Check className="w-4 h-4 text-blue-400 ml-auto" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── BOTH: Custom Courses Multi-Select ── */}
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                            <BookMarked className="w-4 h-4 text-blue-400" />
                            {role === "teacher" ? "Custom Courses You Teach (optional)" : "Custom Courses (optional)"}
                        </label>
                        {loadingCourses ? (
                            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
                        ) : courses.length === 0 ? (
                            <p className="text-sm text-gray-500 py-4 text-center">No custom courses available for your institute yet.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {courses.map((course) => {
                                    const selected = selectedCourses.includes(course.id);
                                    return (
                                        <button
                                            key={course.id}
                                            onClick={() => { setSelectedCourses(toggleItem(selectedCourses, course.id)); setError(""); }}
                                            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${selected
                                                ? "border-blue-500 bg-blue-500/10"
                                                : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                                        >
                                            <span className="font-medium text-white text-sm">{course.name}</span>
                                            {selected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                <button
                    onClick={handleSubmit}
                    disabled={loading || !canSubmit()}
                    className="w-full py-4 rounded-xl bg-white text-black font-semibold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-[0_0_40px_-10px_rgba(255,255,255,0.2)]"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        <><span>Go to Dashboard</span><ArrowRight className="w-5 h-5" /></>
                    )}
                </button>
            </div>
        </div>
    );
}
