"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { GraduationCap, BookOpen, ArrowRight, Loader2, LogOut, BookMarked, Check } from "lucide-react";
import { CLASSES } from "@/lib/types";

interface Course {
    id: string;
    name: string;
}

type StudentType = "class" | "course" | null;

export default function RoleSelectPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [role, setRole] = useState<"student" | "teacher" | null>(null);
    const [studentType, setStudentType] = useState<StudentType>(null);
    const [selectedClass, setSelectedClass] = useState<string>("");
    const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Fetch courses when "course student" is selected
    useEffect(() => {
        if (studentType === "course") {
            setLoadingCourses(true);
            fetch("/api/courses")
                .then((r) => r.json())
                .then((d) => setCourses(d.courses ?? []))
                .catch(() => setError("Could not load courses"))
                .finally(() => setLoadingCourses(false));
        }
    }, [studentType]);

    const toggleCourse = (id: string) => {
        setSelectedCourses((prev) =>
            prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
        );
        setError("");
    };

    const handleSubmit = async () => {
        if (!role) return;

        if (role === "student") {
            if (!studentType) { setError("Please choose school student or course student"); return; }
            if (studentType === "class" && !selectedClass) { setError("Please select your class"); return; }
            if (studentType === "course" && selectedCourses.length === 0) { setError("Please select at least one course"); return; }
        }

        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/user/role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role,
                    class: studentType === "class" ? selectedClass : undefined,
                    enrolled_courses: studentType === "course" ? selectedCourses : undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Something went wrong");
                setLoading(false);
                return;
            }

            await update();
            window.location.href = "/";
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    };

    const canSubmit = () => {
        if (!role) return false;
        if (role === "teacher") return true;
        if (!studentType) return false;
        if (studentType === "class") return !!selectedClass;
        if (studentType === "course") return selectedCourses.length > 0;
        return false;
    };

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">
            {/* Sign Out */}
            <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-sm"
            >
                <LogOut className="w-4 h-4" /> Sign Out
            </button>

            {/* Background gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse" />
            </div>

            <div className="z-10 max-w-lg w-full px-6 space-y-8">
                <div className="text-center space-y-3">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                        Welcome{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}!
                    </h1>
                    <p className="text-gray-400 text-lg">How will you be using Note Taker?</p>
                </div>

                {/* Role Cards */}
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => { setRole("student"); setStudentType(null); setError(""); }}
                        className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 text-left
                            ${role === "student" ? "border-purple-500 bg-purple-500/10 shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"}`}
                    >
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors ${role === "student" ? "bg-purple-500/20 text-purple-400" : "bg-white/10 text-gray-400"}`}>
                            <GraduationCap className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1">Student</h3>
                        <p className="text-sm text-gray-500">Upload notes & get AI feedback</p>
                    </button>

                    <button
                        onClick={() => { setRole("teacher"); setStudentType(null); setError(""); }}
                        className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 text-left
                            ${role === "teacher" ? "border-blue-500 bg-blue-500/10 shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]" : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"}`}
                    >
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors ${role === "teacher" ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-gray-400"}`}>
                            <BookOpen className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1">Teacher</h3>
                        <p className="text-sm text-gray-500">Publish lectures & review notes</p>
                    </button>
                </div>

                {/* Student type selector */}
                {role === "student" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <label className="text-sm font-medium text-gray-400">I am a...</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setStudentType("class"); setSelectedCourses([]); setError(""); }}
                                className={`p-4 rounded-xl border-2 text-left transition-all text-sm
                                    ${studentType === "class" ? "border-purple-500 bg-purple-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                            >
                                <GraduationCap className="w-5 h-5 mb-2 text-purple-400" />
                                <p className="font-semibold text-white">School Student</p>
                                <p className="text-xs text-gray-500 mt-0.5">Class 5–10</p>
                            </button>
                            <button
                                onClick={() => { setStudentType("course"); setSelectedClass(""); setError(""); }}
                                className={`p-4 rounded-xl border-2 text-left transition-all text-sm
                                    ${studentType === "course" ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                            >
                                <BookMarked className="w-5 h-5 mb-2 text-blue-400" />
                                <p className="font-semibold text-white">Course Student</p>
                                <p className="text-xs text-gray-500 mt-0.5">Choose specific courses</p>
                            </button>
                        </div>

                        {/* Class selector */}
                        {studentType === "class" && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
                                <label className="text-sm font-medium text-gray-400">Select Your Class</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {CLASSES.map((cls) => (
                                        <button
                                            key={cls}
                                            onClick={() => { setSelectedClass(cls); setError(""); }}
                                            className={`py-3 rounded-xl text-lg font-semibold transition-all
                                                ${selectedClass === cls ? "bg-purple-500 text-white shadow-lg" : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"}`}
                                        >
                                            Class {cls}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Course multi-select */}
                        {studentType === "course" && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
                                <label className="text-sm font-medium text-gray-400">Select Your Courses</label>
                                {loadingCourses ? (
                                    <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
                                ) : courses.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">No courses available yet.</p>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {courses.map((course) => {
                                            const selected = selectedCourses.includes(course.id);
                                            return (
                                                <button
                                                    key={course.id}
                                                    onClick={() => toggleCourse(course.id)}
                                                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left
                                                        ${selected ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                                                >
                                                    <span className="font-medium text-white text-sm">{course.name}</span>
                                                    {selected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                {role && (
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !canSubmit()}
                        className="w-full py-4 rounded-xl bg-white text-black font-semibold text-lg flex items-center justify-center gap-3
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200
                            disabled:opacity-40 disabled:pointer-events-none
                            shadow-[0_0_40px_-10px_rgba(255,255,255,0.2)]"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Continue as {role === "student" ? "Student" : "Teacher"}</span>
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}
