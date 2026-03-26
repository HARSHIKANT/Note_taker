"use client";

import { useEffect, useState } from "react";
import { Loader2, BarChart2, Users, AlertTriangle, Activity, ShieldCheck } from "lucide-react";

interface AudioInsights {
    student_interaction_percentage: number;
    abusive_language_detected: boolean;
    abusive_language_details: string | null;
    class_tone: string;
    key_interactions_summary: string;
}

interface LectureWithInsights {
    id: string;
    title: string;
    subject: string;
    class: string;
    created_at: string;
    audio_insights: AudioInsights;
    teacher?: { name: string; email: string };
}

interface TeacherAnalyticsViewProps {
    isHeadTeacher: boolean;
}

export function TeacherAnalyticsView({ isHeadTeacher }: TeacherAnalyticsViewProps) {
    const [lectures, setLectures] = useState<LectureWithInsights[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/analytics/teachers")
            .then((r) => r.json())
            .then((d) => {
                setLectures(d.lectures || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
        );
    }

    if (lectures.length === 0) {
        return (
            <div className="text-center py-16 text-neutral-500">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No lecture data with audio insights yet.</p>
                <p className="text-sm mt-1">Upload and transcribe a lecture recording to see insights here.</p>
            </div>
        );
    }

    const avgInteraction = Math.round(
        lectures.reduce((sum, l) => sum + (l.audio_insights?.student_interaction_percentage ?? 0), 0) / lectures.length
    );
    const flaggedCount = lectures.filter((l) => l.audio_insights?.abusive_language_detected).length;

    // Group by teacher for head teacher view
    const groupedByTeacher: Record<string, LectureWithInsights[]> = {};
    for (const lec of lectures) {
        const key = lec.teacher?.name || "You";
        if (!groupedByTeacher[key]) groupedByTeacher[key] = [];
        groupedByTeacher[key].push(lec);
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">
                    {isHeadTeacher ? "Teacher Performance Overview" : "My Performance"}
                </h2>
                <p className="text-sm text-neutral-500 mt-1">
                    {isHeadTeacher
                        ? "AI-powered audio insights from all processed lectures."
                        : "AI-powered audio insights from your processed lectures."}
                </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-neutral-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Total Lectures</p>
                    <p className="text-2xl font-bold text-white">{lectures.length}</p>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-neutral-400 flex items-center gap-1"><Users className="w-3 h-3" /> Avg Interaction</p>
                    <p className="text-2xl font-bold text-blue-400">{avgInteraction}%</p>
                </div>
                <div className={`border rounded-xl p-4 space-y-1 ${flaggedCount > 0 ? "bg-red-950/30 border-red-800" : "bg-neutral-900 border-neutral-800"}`}>
                    <p className="text-xs text-neutral-400 flex items-center gap-1">
                        {flaggedCount > 0 ? <AlertTriangle className="w-3 h-3 text-red-400" /> : <ShieldCheck className="w-3 h-3 text-green-400" />}
                        Flags
                    </p>
                    <p className={`text-2xl font-bold ${flaggedCount > 0 ? "text-red-400" : "text-green-400"}`}>{flaggedCount}</p>
                </div>
            </div>

            {/* Lecture list */}
            {isHeadTeacher
                ? Object.entries(groupedByTeacher).map(([teacherName, lecs]) => (
                    <div key={teacherName} className="space-y-3">
                        <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">{teacherName}</h3>
                        {lecs.map((lec) => <LectureInsightCard key={lec.id} lecture={lec} />)}
                    </div>
                ))
                : lectures.map((lec) => <LectureInsightCard key={lec.id} lecture={lec} />)
            }

            {flaggedCount > 0 && (
                <p className="text-xs text-neutral-500 text-center italic">
                    ⚠ AI-generated flags require human review before any action is taken.
                </p>
            )}
        </div>
    );
}

function LectureInsightCard({ lecture }: { lecture: LectureWithInsights }) {
    const ins = lecture.audio_insights;
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="font-semibold text-white text-sm">{lecture.title}</p>
                    <p className="text-xs text-neutral-500">{lecture.subject} · Class {lecture.class} · {new Date(lecture.created_at).toLocaleDateString()}</p>
                </div>
                {ins.abusive_language_detected && (
                    <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> Flagged
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-800 rounded-lg p-2.5 space-y-1">
                    <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Users className="w-3 h-3" /> Student Interaction</p>
                    <p className="text-lg font-bold text-blue-400">{ins.student_interaction_percentage}%</p>
                    <div className="w-full bg-neutral-700 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${ins.student_interaction_percentage}%` }} />
                    </div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-2.5 space-y-1">
                    <p className="text-[11px] text-neutral-400">Class Tone</p>
                    <p className="text-sm font-semibold text-white leading-tight">{ins.class_tone}</p>
                </div>
            </div>
            <p className="text-xs text-neutral-400 bg-neutral-800 rounded-lg px-3 py-2">{ins.key_interactions_summary}</p>
            {ins.abusive_language_detected && ins.abusive_language_details && (
                <div className="flex items-start gap-2 bg-red-950/30 border border-red-800 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-300">{ins.abusive_language_details}</p>
                </div>
            )}
        </div>
    );
}
