"use client";

import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, Loader2, Sparkles } from "lucide-react";

export default function RegisterInstitutePage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        if (!name.trim()) { setError("Please enter your institute name"); return; }
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/institutes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || "Something went wrong"); setLoading(false); return; }

            // Refresh session to pick up new institute data + head_teacher status
            await update();
            window.location.href = "/";
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-amber-600/15 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-orange-600/15 blur-[120px] rounded-full animate-pulse delay-1000" />
            </div>

            <div className="z-10 max-w-md w-full px-6 space-y-8">
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-amber-400">
                        <Sparkles className="w-4 h-4" />
                        <span>Institute Registration</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Register Your Institute</h1>
                    <p className="text-gray-400">You will be set as the Head Teacher and can manage your roster from the dashboard.</p>
                </div>

                {/* ── Step 1: Sign in first if not authenticated ── */}
                {status === "loading" && (
                    <div className="flex justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    </div>
                )}

                {status === "unauthenticated" && (
                    <div className="space-y-4 p-6 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-sm text-gray-300 text-center">
                            First, sign in with the Google account you want to use as the Head Teacher for your institute.
                        </p>
                        <button
                            onClick={() => signIn("google", { callbackUrl: "/register-institute" })}
                            className="w-full py-3.5 rounded-xl bg-white text-black font-semibold flex items-center justify-center gap-3 hover:scale-[1.02] transition-all duration-200 shadow-[0_0_30px_-10px_rgba(255,255,255,0.3)]"
                        >
                            <span>Sign in with Google to continue</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* ── Step 2: Authenticated — show the form ── */}
                {status === "authenticated" && (
                    <div className="space-y-4">
                        {session?.user?.email && (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-400">
                                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400 uppercase">
                                    {session.user.name?.[0] || "?"}
                                </div>
                                <span className="truncate">Registering as <span className="text-white font-medium">{session.user.email}</span></span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-amber-400" />
                                Institute Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => { setName(e.target.value); setError(""); }}
                                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                                placeholder='e.g. "Springfield High School"'
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-colors"
                            />
                        </div>

                        {error && <p className="text-red-400 text-sm">{error}</p>}

                        <button
                            onClick={handleSubmit}
                            disabled={loading || !name.trim()}
                            className="w-full py-4 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 text-black font-semibold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-[0_0_40px_-10px_rgba(245,158,11,0.4)]"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <span>Register Institute</span>
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
