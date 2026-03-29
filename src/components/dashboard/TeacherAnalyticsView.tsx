"use client";

import { useEffect, useState } from "react";
import {
    Loader2, BarChart2, Users, AlertTriangle, Activity, ShieldCheck,
    BookOpen, ChevronDown, ChevronUp, MessageSquareWarning, Sparkles,
} from "lucide-react";
import type { AudioInsights, ContentQuality, ToneAnalysis } from "@/lib/google-ai";

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

    const lecturesWithContent = lectures.filter((l) => l.audio_insights?.content_quality != null);
    const avgContentScore = lecturesWithContent.length > 0
        ? Math.round(lecturesWithContent.reduce((sum, l) => sum + (l.audio_insights.content_quality!.overall_score ?? 0), 0) / lecturesWithContent.length)
        : null;

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-neutral-400 flex items-center gap-1"><Activity className="w-3 h-3" /> Total Lectures</p>
                    <p className="text-2xl font-bold text-white">{lectures.length}</p>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
                    <p className="text-xs text-neutral-400 flex items-center gap-1"><Users className="w-3 h-3" /> Avg Interaction</p>
                    <p className="text-2xl font-bold text-blue-400">{avgInteraction}%</p>
                </div>
                {avgContentScore !== null && (
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-1">
                        <p className="text-xs text-neutral-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Avg Content Score</p>
                        <p className={`text-2xl font-bold ${avgContentScore >= 70 ? "text-green-400" : avgContentScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                            {avgContentScore}/100
                        </p>
                    </div>
                )}
                <div className={`border rounded-xl p-4 space-y-1 ${flaggedCount > 0 ? "bg-red-950/30 border-red-800" : "bg-neutral-900 border-neutral-800"}`}>
                    <p className="text-xs text-neutral-400 flex items-center gap-1">
                        {flaggedCount > 0 ? <AlertTriangle className="w-3 h-3 text-red-400" /> : <ShieldCheck className="w-3 h-3 text-green-400" />}
                        Safety Flags
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

// ── Score bar helper ──────────────────────────────────────────────────────────
function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
    const pct = Math.round((score / max) * 100);
    const color = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
    return (
        <div className="w-full bg-neutral-700 rounded-full h-1.5">
            <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
    );
}

// ── Severity chip helper ──────────────────────────────────────────────────────
function SeverityChip({ severity }: { severity: "low" | "medium" | "high" | null }) {
    if (!severity) return null;
    const styles = {
        low: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
        medium: "bg-orange-500/10 text-orange-400 border-orange-500/30",
        high: "bg-red-500/10 text-red-400 border-red-500/30",
    };
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${styles[severity]}`}>
            {severity}
        </span>
    );
}

// ── Content Quality Section ───────────────────────────────────────────────────
function ContentQualitySection({ cq }: { cq: ContentQuality }) {
    const parameters: { key: keyof Omit<ContentQuality, "overall_score">; label: string }[] = [
        { key: "explanation_quality", label: "Explanation Quality" },
        { key: "title_relevance", label: "Title Relevance" },
        { key: "content_correctness", label: "Content Correctness" },
        { key: "depth_and_coverage", label: "Depth & Coverage" },
        { key: "engagement_style", label: "Engagement Style" },
    ];

    return (
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
                {parameters.map(({ key, label }) => {
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
    );
}

// ── Tone Analysis Section ─────────────────────────────────────────────────────
function ToneAnalysisSection({ ta }: { ta: ToneAnalysis }) {
    const dimensions: { key: keyof ToneAnalysis; label: string }[] = [
        { key: "harsh_language", label: "Harsh Language" },
        { key: "emotional_statements", label: "Emotional Statements" },
        { key: "negative_statements", label: "Negative / Demotivating" },
    ];

    const anyDetected = dimensions.some(({ key }) => ta[key].detected);

    return (
        <div className="space-y-2.5">
            <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageSquareWarning className="w-3.5 h-3.5 text-purple-400" /> Tone & Language
                {!anyDetected && (
                    <span className="ml-auto text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded">All Clear</span>
                )}
            </p>
            <div className="space-y-2">
                {dimensions.map(({ key, label }) => {
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
                                        <li key={i} className="text-[11px] text-neutral-400 italic border-l-2 border-neutral-700 pl-2 leading-snug">
                                            {ex}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Lecture Insight Card ─────────────────────────────────────────────────────
function LectureInsightCard({ lecture }: { lecture: LectureWithInsights }) {
    const ins = lecture.audio_insights;
    const [expanded, setExpanded] = useState(false);
    const hasDeepAnalysis = !!(ins.content_quality || ins.tone_analysis);
    const cq = ins.content_quality ?? null;

    // Any tone concern detected
    const toneWarning = ins.tone_analysis
        ? Object.values(ins.tone_analysis).some((d: any) => d.detected)
        : false;

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-white text-sm">{lecture.title}</p>
                        <p className="text-xs text-neutral-500">{lecture.subject} · Class {lecture.class} · {new Date(lecture.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                        {cq && (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${cq.overall_score >= 70 ? "bg-green-500/10 text-green-400" : cq.overall_score >= 50 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                {cq.overall_score}/100
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
                    {cq && <ContentQualitySection cq={cq} />}
                    {ins.tone_analysis && (
                        <>
                            {cq && <div className="border-t border-neutral-800" />}
                            <ToneAnalysisSection ta={ins.tone_analysis} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
