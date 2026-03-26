"use client";

import { useEffect, useState } from "react";
import {
    Loader2, AlertTriangle, Users, Activity,
    ShieldCheck, BarChart2, TrendingUp, User
} from "lucide-react";

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
    teacher_id: string;
    audio_insights: AudioInsights;
    teacher?: { name: string; email: string };
}

export function HeadTeacherAnalyticsView({ myId }: { myId: string }) {
    const [allLectures, setAllLectures] = useState<LectureWithInsights[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "mine" | "all">("overview");

    useEffect(() => {
        fetch("/api/analytics/teachers")
            .then((r) => r.json())
            .then((d) => {
                setAllLectures(d.lectures || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const myLectures = allLectures.filter((l) => l.teacher_id === myId);
    const otherLectures = allLectures.filter((l) => l.teacher_id !== myId);

    // Group others by teacher
    const teacherGroups: Record<string, { name: string; email: string; lectures: LectureWithInsights[] }> = {};
    for (const lec of otherLectures) {
        const key = lec.teacher_id;
        if (!teacherGroups[key]) {
            teacherGroups[key] = {
                name: lec.teacher?.name || "Unknown Teacher",
                email: lec.teacher?.email || "",
                lectures: [],
            };
        }
        teacherGroups[key].lectures.push(lec);
    }

    // Compute metrics per teacher group + my stats
    const teacherStats = Object.entries(teacherGroups).map(([id, g]) => ({
        id,
        name: g.name,
        email: g.email,
        lectures: g.lectures,
        avgInteraction: avg(g.lectures.map((l) => l.audio_insights.student_interaction_percentage)),
        flagCount: g.lectures.filter((l) => l.audio_insights.abusive_language_detected).length,
    })).sort((a, b) => b.avgInteraction - a.avgInteraction);

    const myAvgInteraction = avg(myLectures.map((l) => l.audio_insights.student_interaction_percentage));
    const myFlagCount = myLectures.filter((l) => l.audio_insights.abusive_language_detected).length;
    const totalFlags = allLectures.filter((l) => l.audio_insights.abusive_language_detected).length;
    const overallAvg = avg(allLectures.map((l) => l.audio_insights.student_interaction_percentage));

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-950/60 via-neutral-900 to-neutral-900 border border-amber-800/40 p-5">
                <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full -translate-y-12 translate-x-12" />
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <BarChart2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="font-bold text-white text-lg leading-tight">Head Teacher Analytics</p>
                        <p className="text-xs text-amber-400/80">School-wide performance overview</p>
                    </div>
                </div>

                {/* Overall stats */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                    <StatCard label="Total Lectures" value={allLectures.length} color="text-white" />
                    <StatCard label="School Avg Interaction" value={`${overallAvg}%`} color="text-blue-400" />
                    <StatCard
                        label="Safety Flags"
                        value={totalFlags}
                        color={totalFlags > 0 ? "text-red-400" : "text-green-400"}
                        icon={totalFlags > 0 ? <AlertTriangle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
                {([
                    { key: "overview", label: "Overview", icon: <TrendingUp className="w-3.5 h-3.5" /> },
                    { key: "mine", label: "My Lectures", icon: <User className="w-3.5 h-3.5" /> },
                    { key: "all", label: "All Teachers", icon: <Users className="w-3.5 h-3.5" /> },
                ] as const).map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.key
                            ? "bg-amber-500/15 border border-amber-600/30 text-amber-300"
                            : "text-neutral-500 hover:text-neutral-300"
                            }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Teacher Leaderboard (by interaction %)</p>
                    {/* My rank card */}
                    <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-amber-400" />
                                <span className="text-sm font-semibold text-amber-200">You (Head Teacher)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {myFlagCount > 0 && (
                                    <span className="text-xs text-red-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />{myFlagCount}
                                    </span>
                                )}
                                <span className="text-lg font-bold text-blue-400">{myAvgInteraction}%</span>
                            </div>
                        </div>
                        <InteractionBar value={myAvgInteraction} color="bg-amber-500" />
                        <p className="text-xs text-neutral-500">{myLectures.length} lecture{myLectures.length !== 1 ? "s" : ""} analysed</p>
                    </div>

                    {teacherStats.map((t) => (
                        <div key={t.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-white">{t.name}</p>
                                    <p className="text-xs text-neutral-500">{t.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {t.flagCount > 0 && (
                                        <span className="text-xs text-red-400 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />{t.flagCount}
                                        </span>
                                    )}
                                    <span className="text-lg font-bold text-blue-400">{t.avgInteraction}%</span>
                                </div>
                            </div>
                            <InteractionBar value={t.avgInteraction} color="bg-blue-500" />
                            <p className="text-xs text-neutral-500">{t.lectures.length} lecture{t.lectures.length !== 1 ? "s" : ""} analysed</p>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === "mine" && (
                <div className="space-y-3">
                    {myLectures.length === 0 ? (
                        <EmptyState message="None of your published lectures have been analysed yet." />
                    ) : (
                        myLectures.map((l) => <LectureCard key={l.id} lecture={l} />)
                    )}
                </div>
            )}

            {activeTab === "all" && (
                <div className="space-y-6">
                    {Object.entries(teacherGroups).length === 0 ? (
                        <EmptyState message="No other teachers have analysed lectures yet." />
                    ) : (
                        Object.entries(teacherGroups).map(([id, g]) => (
                            <div key={id} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300">
                                        {g.name[0]}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-neutral-200">{g.name}</p>
                                        <p className="text-xs text-neutral-500">{g.email}</p>
                                    </div>
                                </div>
                                {g.lectures.map((l) => <LectureCard key={l.id} lecture={l} />)}
                            </div>
                        ))
                    )}
                </div>
            )}

            {totalFlags > 0 && (
                <p className="text-xs text-neutral-600 text-center italic">
                    ⚠ AI-generated language flags require human review before any action is taken.
                </p>
            )}
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon?: React.ReactNode }) {
    return (
        <div className="bg-black/20 rounded-xl px-3 py-2.5 space-y-0.5">
            <p className="text-[10px] text-neutral-500 flex items-center gap-1">{icon}{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
    );
}

function InteractionBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-full bg-neutral-700/50 rounded-full h-1.5">
            <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
        </div>
    );
}

function LectureCard({ lecture }: { lecture: LectureWithInsights }) {
    const ins = lecture.audio_insights;
    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-white">{lecture.title}</p>
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
                    <InteractionBar value={ins.student_interaction_percentage} color="bg-blue-500" />
                </div>
                <div className="bg-neutral-800 rounded-lg p-2.5 space-y-1">
                    <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Class Tone</p>
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

function EmptyState({ message }: { message: string }) {
    return (
        <div className="text-center py-12">
            <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-neutral-500">{message}</p>
        </div>
    );
}

function avg(nums: number[]): number {
    if (!nums.length) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
