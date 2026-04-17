"use client";

import { useEffect, useState } from "react";
import { BookOpen, Atom, FlaskConical, Calculator, BookMarked, Loader2 } from "lucide-react";
import { SUBJECTS } from "@/lib/types";
import { useSession } from "next-auth/react";
import type { ExtendedSession } from "@/lib/types";

const SUBJECT_ICONS: Record<string, any> = {
    Physics: Atom,
    Chemistry: FlaskConical,
    Math: Calculator,
};

interface Course { id: string; name: string; }

interface SubjectsViewProps {
    onSelectSubject: (subject: string) => void;
    onSelectCourse: (course: Course) => void;
}

export function SubjectsView({ onSelectSubject, onSelectCourse }: SubjectsViewProps) {
    const { data: session } = useSession();
    const extSession = session as unknown as ExtendedSession;
    // Show all subjects if none are assigned yet (fallback), otherwise filter to assigned only
    const visibleSubjects = extSession?.assignedSubjects?.length
        ? SUBJECTS.filter((s) => extSession.assignedSubjects!.includes(s))
        : [...SUBJECTS];

    const [courses, setCourses] = useState<Course[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(true);

    useEffect(() => {
        fetch("/api/courses")
            .then((r) => r.json())
            .then((d) => setCourses(d.courses ?? []))
            .catch(() => { })
            .finally(() => setLoadingCourses(false));
    }, []);

    return (
        <>
            {/* Traditional Subjects */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-white">My Subjects</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {visibleSubjects.map((sub) => {
                        const Icon = SUBJECT_ICONS[sub] || BookOpen;
                        return (
                            <button
                                key={sub}
                                onClick={() => onSelectSubject(sub)}
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
            </div>

            {/* Dynamic Courses Section */}
            {(loadingCourses || courses.length > 0) && (
                <div className="space-y-4 mt-8">
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold text-white">Courses</h2>
                        <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">Custom</span>
                    </div>
                    {loadingCourses ? (
                        <div className="flex items-center gap-2 text-neutral-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading courses...
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {courses.map((course) => (
                                <button
                                    key={course.id}
                                    onClick={() => onSelectCourse(course)}
                                    className="group p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-blue-700/50 transition-all text-left hover:shadow-lg hover:shadow-blue-500/5"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                                        <BookMarked className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-white">{course.name}</h3>
                                    <p className="text-xs text-blue-500 mt-1">Custom Course</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
