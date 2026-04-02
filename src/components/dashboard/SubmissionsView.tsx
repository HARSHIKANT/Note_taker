import { useState, useEffect } from "react";
import { Loader2, Users, TrendingUp, AlertCircle, Cpu, RefreshCw, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Lecture, Submission } from "./types";

interface SubmissionsViewProps {
    lecture: Lecture;
    submissions: Submission[];
    loadingSubs: boolean;
    insights: any;
    insightsLastGeneratedAt?: string | null;
    aiDetectionInsights: any;
}

export function SubmissionsView({
    lecture,
    submissions,
    loadingSubs,
    insights: initialInsights,
    insightsLastGeneratedAt: initialLastGeneratedAt,
    aiDetectionInsights,
}: SubmissionsViewProps) {
    const [activeTab, setActiveTab] = useState<"notes" | "ai">("notes");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [insights, setInsights] = useState<any>(initialInsights);
    const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(initialLastGeneratedAt ?? null);
    const [generatingInsights, setGeneratingInsights] = useState(false);

    useEffect(() => {
        if (initialInsights !== undefined) setInsights(initialInsights);
        if (initialLastGeneratedAt !== undefined) setLastGeneratedAt(initialLastGeneratedAt ?? null);
    }, [initialInsights, initialLastGeneratedAt]);

    const handleGenerateInsights = async () => {
        setGeneratingInsights(true);
        try {
            const res = await fetch("/api/lectures/generate-insights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lecture_id: lecture.id }),
            });
            const data = await res.json();
            if (res.ok) {
                setInsights(data.insights);
                setLastGeneratedAt(data.insights_last_generated_at);
            } else {
                alert("Failed to generate insights: " + data.error);
            }
        } catch (err: any) {
            alert("Error: " + err.message);
        }
        setGeneratingInsights(false);
    };

    const formatTimeAgo = (iso: string) => {
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
        return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? "s" : ""} ago`;
    };

    return (
        <>
            <div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white">{lecture.title}</h2>
                <p className="text-sm lg:text-base text-neutral-400 mt-1">Class {lecture.class} • Student Submissions</p>
            </div>

            {loadingSubs ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                </div>
            ) : submissions.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                    <Users className="w-12 h-12 text-neutral-600 mx-auto" />
                    <p className="text-neutral-300 text-lg">No submissions yet</p>
                    <p className="text-sm text-neutral-500">
                        {lecture.published
                            ? "Students haven't uploaded notes yet."
                            : "Publish this lecture to allow student submissions."}
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Toggle Tabs */}
                    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => setActiveTab("notes")}
                            className={`px-4 lg:px-6 py-2 rounded-lg text-sm lg:text-base font-semibold transition-colors ${activeTab === "notes" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                        >
                            Analysis
                        </button>
                        <button
                            onClick={() => setActiveTab("ai")}
                            className={`px-4 lg:px-6 py-2 rounded-lg text-sm lg:text-base font-semibold transition-colors ${activeTab === "ai" ? "bg-purple-600 text-white" : "text-neutral-400 hover:text-white"
                                }`}
                        >
                            AI Detection
                        </button>
                    </div>

                    {/* Notes Analysis — On-Demand Class Insights Panel */}
                    {activeTab === "notes" && (
                        <div className="p-5 lg:p-7 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white text-base lg:text-lg">Class Insights</h3>
                                        {lastGeneratedAt ? (
                                            <p className="text-xs text-neutral-500">Last generated: {formatTimeAgo(lastGeneratedAt)}</p>
                                        ) : (
                                            <p className="text-xs lg:text-sm text-neutral-400">AI-generated summary of class performance</p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={handleGenerateInsights}
                                    disabled={generatingInsights}
                                    className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50 shrink-0 ${insights
                                        ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700"
                                        : "bg-blue-600 hover:bg-blue-500 text-white"
                                        }`}
                                >
                                    {generatingInsights ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                                    ) : insights ? (
                                        <><RefreshCw className="w-4 h-4" /> Regenerate</>
                                    ) : (
                                        <><Sparkles className="w-4 h-4" /> Generate Class Insights</>
                                    )}
                                </button>
                            </div>

                            {/* Empty state */}
                            {!insights && !generatingInsights && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                                    <div className="p-4 bg-blue-500/10 rounded-full">
                                        <Sparkles className="w-7 h-7 text-blue-400" />
                                    </div>
                                    <p className="text-white font-medium">No insights generated yet</p>
                                    <p className="text-sm text-neutral-400 max-w-xs">
                                        Click "Generate Class Insights" once all students have submitted for the most accurate summary.
                                    </p>
                                </div>
                            )}

                            {/* Loading state */}
                            {generatingInsights && (
                                <div className="flex flex-col items-center justify-center py-10 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                                    <p className="text-sm text-neutral-400">Analyzing class submissions...</p>
                                </div>
                            )}

                            {/* Insights data */}
                            {insights && !generatingInsights && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Left: Score Distribution */}
                                    <div className="p-5 rounded-xl bg-neutral-950/50 border border-neutral-800">
                                        <div className="flex justify-between items-end mb-5">
                                            <span className="text-sm lg:text-base text-neutral-300 font-medium">Average Score</span>
                                            <span className={`text-3xl lg:text-4xl font-bold ${insights.averageScore >= 80 ? 'text-green-400' :
                                                insights.averageScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                                                }`}>{insights.averageScore}%</span>
                                        </div>
                                        <div className="h-40 lg:h-52 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={insights.scoreDistribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                                    <XAxis dataKey="range" stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                                                    <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                                    <Tooltip
                                                        cursor={{ fill: '#262626' }}
                                                        contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                                                    />
                                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Right: Most Missed Concepts */}
                                    <div className="p-5 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 text-orange-400" />
                                            <span className="text-sm lg:text-base font-semibold text-white">Most Missed Concepts</span>
                                        </div>
                                        <p className="text-sm text-neutral-300 leading-relaxed">
                                            {insights.missedConceptsSummary}
                                        </p>
                                        {insights.missingTopicsList?.length > 0 && (
                                            <ul className="text-sm text-neutral-400 space-y-1.5 mt-2">
                                                {insights.missingTopicsList.map((topic: string, i: number) => (
                                                    <li key={i} className="flex gap-2">
                                                        <span className="text-orange-400/70">•</span>
                                                        {topic}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Detection Insights Panel */}
                    {activeTab === "ai" && aiDetectionInsights && (
                        <div className="p-5 lg:p-7 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                                    <Cpu className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white text-base lg:text-lg">AI Detection Insights</h3>
                                    <p className="text-xs lg:text-sm text-neutral-400">Class-wide AI probability metrics</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Left: Distribution chart */}
                                <div className="p-5 rounded-xl bg-neutral-950/50 border border-neutral-800">
                                    <div className="flex justify-between items-end mb-5">
                                        <span className="text-sm lg:text-base text-neutral-300 font-medium">Class Average AI</span>
                                        <span className={`text-3xl lg:text-4xl font-bold ${aiDetectionInsights.averageAiProbability >= 50 ? 'text-red-400' : 'text-green-400'
                                            }`}>{aiDetectionInsights.averageAiProbability.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-40 lg:h-52 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={aiDetectionInsights.distribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                                <XAxis dataKey="range" stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                                <Tooltip
                                                    cursor={{ fill: '#262626' }}
                                                    contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                                                />
                                                <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Right: Summary/Warning */}
                                <div className="p-5 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3 flex flex-col justify-center">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className={`w-4 h-4 ${aiDetectionInsights.averageAiProbability >= 50 ? 'text-red-400' : 'text-green-400'}`} />
                                        <span className="text-sm lg:text-base font-semibold text-white">Overall Status</span>
                                    </div>
                                    <p className="text-sm text-neutral-300 leading-relaxed">
                                        {aiDetectionInsights.averageAiProbability >= 50
                                            ? "The class average suggests a high likelihood of AI-generated content. You may want to review individual submissions closely for generic phrasing and unnatural coherence."
                                            : "The class average suggests submissions are mostly human-written, showing expected variations in language and personal structure."
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h3 className="text-sm lg:text-base font-semibold text-neutral-300">Individual Submissions</h3>
                        </div>

                        {/* Break-out wrapper */}
                        <div className="w-[100vw] relative left-1/2 -translate-x-1/2">
                            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {submissions.map((sub) => {
                                        let feedback: any = null;
                                        try { feedback = sub.ai_feedback ? JSON.parse(sub.ai_feedback) : null; } catch { }

                                        return (
                                            <div
                                                key={sub.id}
                                                onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                                                className={`min-h-48 p-4 sm:p-5 lg:p-6 rounded-2xl bg-neutral-900 border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col gap-3
                                                    ${expandedId === sub.id
                                                        ? "border-blue-500/50 shadow-lg shadow-blue-500/10 col-span-full row-span-2"
                                                        : "border-neutral-800 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center flex-1 min-w-0 shrink">
                                                        <div className="hidden sm:flex w-10 h-10 rounded-full bg-linear-to-tr from-purple-500 to-pink-500 items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
                                                            {sub.student_name?.[0]?.toUpperCase() || "?"}
                                                        </div>
                                                        <div className="mr-3 sm:mx-3 flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-white truncate" title={sub.student_name}>{sub.student_name}</p>
                                                            <p className="text-xs text-neutral-500 mt-0.5 truncate">
                                                                {new Date(sub.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                                                {' • '}
                                                                {new Date(sub.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center justify-end">
                                                        {sub.ocr_status === "completed" && sub.match_score != null ? (
                                                            activeTab === "notes" ? (
                                                                <span className="flex flex-col items-end gap-0.5">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Notes Coverage</span>
                                                                    <span className={`text-sm font-bold px-2.5 py-0.5 rounded-lg ${sub.match_score >= 80 ? "bg-green-500/10 text-green-400" :
                                                                        sub.match_score >= 50 ? "bg-yellow-500/10 text-yellow-400" :
                                                                            "bg-red-500/10 text-red-400"
                                                                        }`}>{sub.match_score}%</span>
                                                                </span>
                                                            ) : (
                                                                <span className="flex flex-col items-end gap-0.5">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">AI Written</span>
                                                                    <span className={`text-sm font-bold px-2.5 py-0.5 rounded-lg ${sub.ai_probability && sub.ai_probability > 50 ? "bg-red-500/10 text-red-400" :
                                                                        "bg-green-500/10 text-green-400"
                                                                        }`}>{sub.ai_probability || 0}%</span>
                                                                </span>
                                                            )
                                                        ) : sub.ocr_status === "processing" ? (
                                                            <span className="text-xs text-neutral-500 flex items-center gap-1 font-medium bg-neutral-800 px-2 py-1 rounded-md">
                                                                <Loader2 className="w-3 h-3 animate-spin text-neutral-400" /> Wait
                                                            </span>
                                                        ) : sub.ocr_status === "failed" ? (
                                                            <span className="text-xs text-red-400 font-medium bg-red-500/10 px-2 py-1 rounded-md">Failed</span>
                                                        ) : (
                                                            <span className="text-xs text-neutral-500 font-medium bg-neutral-800 px-2 py-1 rounded-md">Pending</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="mt-auto pt-3 border-t border-neutral-800/60">
                                                    {activeTab === "notes" && feedback ? (
                                                        <div className="space-y-4">
                                                            <div className="space-y-2.5">
                                                                <p className={`text-xs text-neutral-400 leading-relaxed ${expandedId === sub.id ? "" : "line-clamp-2"}`} title={feedback.feedback}>
                                                                    {feedback.feedback}
                                                                </p>
                                                                <div className="space-y-1.5">
                                                                    <div className="flex items-center justify-between text-[10px] font-semibold tracking-wide uppercase">
                                                                        {feedback.covered?.length > 0 ? <span className="text-green-500">{feedback.covered.length} covered</span> : <span />}
                                                                        {feedback.missing?.length > 0 ? <span className="text-red-500">{feedback.missing.length} missing</span> : <span />}
                                                                    </div>
                                                                    <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-500 ${feedback.score >= 80 ? "bg-green-500" :
                                                                                feedback.score >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                                                }`}
                                                                            style={{ width: `${feedback.score}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Mode: Full Lists */}
                                                            {expandedId === sub.id && (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-800">
                                                                    {feedback.covered?.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-green-500/80">Covered Topics</h4>
                                                                            <ul className="space-y-1.5">
                                                                                {feedback.covered.map((topic: string, i: number) => (
                                                                                    <li key={i} className="text-xs text-neutral-300 flex items-start gap-2">
                                                                                        <span className="text-green-500 mt-0.5">•</span>
                                                                                        <span className="leading-snug">{topic}</span>
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                    {feedback.missing?.length > 0 && (
                                                                        <div className="space-y-2">
                                                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-red-500/80">Missing Topics</h4>
                                                                            <ul className="space-y-1.5">
                                                                                {feedback.missing.map((topic: string, i: number) => (
                                                                                    <li key={i} className="text-xs text-neutral-300 flex items-start gap-2">
                                                                                        <span className="text-red-500 mt-0.5">•</span>
                                                                                        <span className="leading-snug">{topic}</span>
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : activeTab === "ai" && sub.ocr_status === "completed" ? (
                                                        <div className="space-y-4">
                                                            <div className="space-y-2.5">
                                                                <p className={`text-xs text-neutral-400 leading-relaxed ${expandedId === sub.id ? "" : "line-clamp-2"}`} title={sub.ai_explanation || ""}>
                                                                    {sub.ai_explanation || "No AI explanation provided."}
                                                                </p>
                                                                <div className="space-y-2">
                                                                    <div className="space-y-1">
                                                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide">
                                                                            <span className="flex items-center gap-1 text-red-500"><Cpu className="w-3 h-3" /> AI</span>
                                                                            <span className="text-red-500">{sub.ai_probability || 0}%</span>
                                                                        </div>
                                                                        <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full rounded-full bg-red-500 transition-all duration-500"
                                                                                style={{ width: `${sub.ai_probability || 0}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-1">
                                                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide">
                                                                            <span className="flex items-center gap-1 text-green-500"><Users className="w-3 h-3" /> Human</span>
                                                                            <span className="text-green-500">{sub.human_probability || 0}%</span>
                                                                        </div>
                                                                        <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full rounded-full bg-green-500 transition-all duration-500"
                                                                                style={{ width: `${sub.human_probability || 0}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-neutral-500 py-1">
                                                            {sub.ocr_status === "processing" ? "Analysis in progress..." : "No analysis available."}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
