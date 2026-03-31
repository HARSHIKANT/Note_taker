"use client";

import { useEffect, useState } from "react";
import {
    Loader2, AlertTriangle, Users, Activity,
    ShieldCheck, BarChart2, TrendingUp, User,
    BookOpen, ChevronDown, ChevronUp, MessageSquareWarning, Sparkles,
} from "lucide-react";

interface ContentQualityParam { score: number; note: string; }
interface ContentQuality {
    overall_score: number;
    explanation_quality: ContentQualityParam;
    title_relevance: ContentQualityParam;
    content_correctness: ContentQualityParam;
    depth_and_coverage: ContentQualityParam;
    engagement_style: ContentQualityParam;
}
interface ToneDimension { detected: boolean; severity: "low" | "medium" | "high" | null; examples: string[]; }
interface ToneAnalysis {
    harsh_language: ToneDimension;
    emotional_statements: ToneDimension;
    negative_statements: ToneDimension;
}
interface AudioInsights {
    student_interaction_percentage: number;
    abusive_language_detected: boolean;
    abusive_language_details: string | null;
    class_tone: string;
    key_interactions_summary: string;
    content_quality?: ContentQuality | null;
    tone_analysis?: ToneAnalysis | null;
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
            .then((d) => { setAllLectures(d.lectures || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const myLectures = allLectures.filter((l) => l.teacher_id === myId);
    const otherLectures = allLectures.filter((l) => l.teacher_id !== myId);

    const teacherGroups: Record<string, { name: string; email: string; lectures: LectureWithInsights[] }> = {};
    for (const lec of otherLectures) {
        const key = lec.teacher_id;
        if (!teacherGroups[key]) {
            teacherGroups[key] = { name: lec.teacher?.name || "Unknown Teacher", email: lec.teacher?.email || "", lectures: [] };
        }
        teacherGroups[key].lectures.push(lec);
    }

    const teacherStats = Object.entries(teacherGroups).map(([id, g]) => ({
        id, name: g.name, email: g.email, lectures: g.lectures,
        avgInteraction: avg(g.lectures.map((l) => l.audio_insights.student_interaction_percentage)),
        avgContent: avgContent(g.lectures),
        flagCount: g.lectures.filter((l) => l.audio_insights.abusive_language_detected).length,
    })).sort((a, b) => b.avgInteraction - a.avgInteraction);

    const myAvgInteraction = avg(myLectures.map((l) => l.audio_insights.student_interaction_percentage));
    const myFlagCount = myLectures.filter((l) => l.audio_insights.abusive_language_detected).length;
    const myAvgContent = avgContent(myLectures);
    const totalFlags = allLectures.filter((l) => l.audio_insights.abusive_language_detected).length;
    const overallAvg = avg(allLectures.map((l) => l.audio_insights.student_interaction_percentage));

    if (loading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>;
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

            {/* Overview */}
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
                            <div className="flex items-center gap-3">
                                {myAvgContent !== null && (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Content Quality</span>
                                        <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${myAvgContent >= 70 ? "bg-green-500/10 text-green-400" : myAvgContent >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                            {myAvgContent}/100
                                        </span>
                                    </div>
                                )}
                                {myFlagCount > 0 && (
                                    <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{myFlagCount}</span>
                                )}
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Student Interaction</span>
                                    <span className="text-sm font-bold text-blue-400">{myAvgInteraction}%</span>
                                </div>
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
                                <div className="flex items-center gap-3">
                                    {t.avgContent !== null && (
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Content Quality</span>
                                            <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${t.avgContent >= 70 ? "bg-green-500/10 text-green-400" : t.avgContent >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                                {t.avgContent}/100
                                            </span>
                                        </div>
                                    )}
                                    {t.flagCount > 0 && (
                                        <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{t.flagCount}</span>
                                    )}
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Student Interaction</span>
                                        <span className="text-sm font-bold text-blue-400">{t.avgInteraction}%</span>
                                    </div>
                                </div>
                            </div>
                            <InteractionBar value={t.avgInteraction} color="bg-blue-500" />
                            <p className="text-xs text-neutral-500">{t.lectures.length} lecture{t.lectures.length !== 1 ? "s" : ""} analysed</p>
                        </div>
                    ))}
                </div>
            )}

            {/* My Lectures */}
            {activeTab === "mine" && (
                <div className="space-y-3">
                    {myLectures.length === 0
                        ? <EmptyState message="None of your published lectures have been analysed yet." />
                        : myLectures.map((l) => <LectureCard key={l.id} lecture={l} />)
                    }
                </div>
            )}

            {/* All Teachers */}
            {activeTab === "all" && (
                <div className="space-y-6">
                    {Object.entries(teacherGroups).length === 0
                        ? <EmptyState message="No other teachers have analysed lectures yet." />
                        : Object.entries(teacherGroups).map(([id, g]) => (
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
                    }
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function avg(nums: number[]): number {
    if (!nums.length) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
function avgContent(lectures: LectureWithInsights[]): number | null {
    const valid = lectures.filter((l) => l.audio_insights?.content_quality?.overall_score != null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, l) => s + l.audio_insights.content_quality!.overall_score, 0) / valid.length);
}

// ── Sub-components ────────────────────────────────────────────────────────────
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
function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
    const pct = Math.round((score / max) * 100);
    const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
    return (
        <div className="w-full bg-neutral-700 rounded-full h-1.5">
            <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
    );
}
function SeverityChip({ severity }: { severity: "low" | "medium" | "high" | null }) {
    if (!severity) return null;
    const styles = { low: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", medium: "bg-orange-500/10 text-orange-400 border-orange-500/30", high: "bg-red-500/10 text-red-400 border-red-500/30" };
    return <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${styles[severity]}`}>{severity}</span>;
}
function EmptyState({ message }: { message: string }) {
    return (
        <div className="text-center py-12">
            <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-neutral-500">{message}</p>
        </div>
    );
}

// ── Main Lecture Card ─────────────────────────────────────────────────────────
function LectureCard({ lecture }: { lecture: LectureWithInsights }) {
    const ins = lecture.audio_insights;
    const [expanded, setExpanded] = useState(false);
    const cq = ins.content_quality ?? null;
    const ta = ins.tone_analysis ?? null;
    const hasDeepAnalysis = !!(cq || ta);
    const toneWarning = ta ? Object.values(ta).some((d) => d.detected) : false;

    const contentParams: { key: keyof Omit<ContentQuality, "overall_score">; label: string }[] = [
        { key: "explanation_quality", label: "Explanation Quality" },
        { key: "title_relevance", label: "Title Relevance" },
        { key: "content_correctness", label: "Content Correctness" },
        { key: "depth_and_coverage", label: "Depth & Coverage" },
        { key: "engagement_style", label: "Engagement Style" },
    ];
    const toneDimensions: { key: keyof ToneAnalysis; label: string }[] = [
        { key: "harsh_language", label: "Harsh Language" },
        { key: "emotional_statements", label: "Emotional Statements" },
        { key: "negative_statements", label: "Negative / Demotivating" },
    ];
    const anyToneDetected = ta ? toneDimensions.some(({ key }) => ta[key].detected) : false;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 space-y-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-white text-sm">{lecture.title}</p>
                        <p className="text-xs text-neutral-500">{lecture.subject} · Class {lecture.class} · {new Date(lecture.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                        {cq && (
                            <span className={`flex flex-col items-end gap-0.5`}>
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500">Content Quality</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${cq.overall_score >= 70 ? "bg-green-500/10 text-green-400" : cq.overall_score >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                    {cq.overall_score}/100
                                </span>
                            </span>
                        )}
                        {toneWarning && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                                <MessageSquareWarning className="w-3 h-3" /> Tone
                            </span>
                        )}
                        {ins.abusive_language_detected && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/40 border border-red-800 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> Flagged
                            </span>
                        )}
                    </div>
                </div>

                {/* Basic metrics */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-neutral-800 rounded-lg p-2.5 space-y-1">
                        <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Users className="w-3 h-3" /> Student Interaction</p>
                        <p className="text-lg font-bold text-blue-400">{ins.student_interaction_percentage}%
                            <span className="text-[10px] font-normal text-neutral-500 ml-1">of class time</span>
                        </p>
                        <InteractionBar value={ins.student_interaction_percentage} color="bg-blue-500" />
                    </div>
                    <div className="bg-neutral-800 rounded-lg p-2.5 space-y-1">
                        <p className="text-[11px] text-neutral-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Class Tone</p>
                        <p className="text-sm font-semibold text-white leading-tight">{ins.class_tone}</p>
                    </div>
                </div>

                {/* Interaction summary */}
                <p className="text-xs text-neutral-400 bg-neutral-800 rounded-lg px-3 py-2">{ins.key_interactions_summary}</p>

                {/* Abusive flag */}
                {ins.abusive_language_detected && ins.abusive_language_details && (
                    <div className="flex items-start gap-2 bg-red-950/30 border border-red-800 rounded-lg p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-300">{ins.abusive_language_details}</p>
                    </div>
                )}

                {/* Expand toggle */}
                {hasDeepAnalysis && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors py-1 border-t border-neutral-800 mt-1"
                    >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {expanded ? "Hide" : "Show"} Deep Analysis
                    </button>
                )}
            </div>

            {/* Expanded deep analysis */}
            {expanded && hasDeepAnalysis && (
                <div className="border-t border-neutral-800 p-4 space-y-5 bg-neutral-950/40">

                    {/* Content Quality */}
                    {cq && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 uppercase tracking-wide">
                                    <BookOpen className="w-3.5 h-3.5 text-blue-400" /> Content Quality
                                </p>
                                <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${cq.overall_score >= 70 ? "bg-green-500/10 text-green-400" : cq.overall_score >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                    {cq.overall_score}/100
                                </span>
                            </div>
                            <div className="space-y-2.5">
                                {contentParams.map(({ key, label }) => {
                                    const param = cq[key];
                                    return (
                                        <div key={key} className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-neutral-400">{label}</span>
                                                <span className="font-semibold text-neutral-300">{param.score}/10</span>
                                            </div>
                                            <ScoreBar score={param.score} max={10} />
                                            <p className="text-[11px] text-neutral-500 leading-snug">{param.note}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tone Analysis */}
                    {ta && (
                        <>
                            {cq && <div className="border-t border-neutral-800" />}
                            <div className="space-y-2.5">
                                <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 uppercase tracking-wide">
                                    <MessageSquareWarning className="w-3.5 h-3.5 text-purple-400" /> Tone & Language
                                    {!anyToneDetected && (
                                        <span className="ml-auto text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded">All Clear</span>
                                    )}
                                </p>
                                <div className="space-y-2">
                                    {toneDimensions.map(({ key, label }) => {
                                        const dim = ta[key];
                                        return (
                                            <div key={key} className={`rounded-lg p-2.5 border ${dim.detected ? "bg-neutral-950/50 border-neutral-700" : "bg-neutral-800/30 border-neutral-800"}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[11px] font-medium ${dim.detected ? "text-neutral-300" : "text-neutral-500"}`}>{label}</span>
                                                    {dim.detected
                                                        ? <SeverityChip severity={dim.severity} />
                                                        : <span className="text-[10px] text-neutral-600">Not detected</span>
                                                    }
                                                </div>
                                                {dim.detected && dim.examples.length > 0 && (
                                                    <ul className="mt-1.5 space-y-1">
                                                        {dim.examples.map((ex, i) => (
                                                            <li key={i} className="text-[11px] text-neutral-400 italic border-l-2 border-neutral-700 pl-2 leading-snug">{ex}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Sparkle badge */}
                    <p className="text-[10px] text-neutral-600 text-center flex items-center justify-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI-generated analysis · for guidance only
                    </p>
                </div>
            )}
        </div>
    );
}
