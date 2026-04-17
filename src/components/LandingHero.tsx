
"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, GraduationCap, Sparkles, Shield, BookOpen } from "lucide-react";

export function LandingHero() {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse delay-1000" />
                <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] bg-amber-600/10 blur-[100px] rounded-full animate-pulse delay-500" />
            </div>

            <div className="z-10 max-w-4xl w-full px-6 space-y-12 animate-in fade-in zoom-in duration-700">
                {/* Header */}
                <div className="text-center space-y-5">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-sm font-medium text-gray-300">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span>AI-Powered Learning Platform</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40">
                        Note Taker
                    </h1>

                    <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        A secure, institute-managed learning platform.
                        Capture notes, get AI feedback, and track progress.
                    </p>
                </div>

                {/* Two Sign-In Paths */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Institute (Head Teacher) Path */}
                    <div className="group relative flex flex-col gap-5 p-7 rounded-2xl bg-white/5 border border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all duration-300">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
                                <Building2 className="w-6 h-6 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Institute / School</h2>
                                <p className="text-sm text-gray-400 mt-1">
                                    Register your school and manage your teachers and students from a central dashboard.
                                </p>
                            </div>
                        </div>

                        <ul className="space-y-2 text-sm text-gray-500">
                            <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />Manage your institute roster</li>
                            <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />Create and assign custom courses</li>
                            <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />Full analytics dashboard</li>
                        </ul>

                        <div className="flex flex-col gap-2 mt-auto">
                            {/* First-time registration */}
                            <button
                                onClick={() => router.push("/register-institute")}
                                className="w-full flex items-center justify-between px-5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold text-sm hover:bg-amber-500/20 hover:border-amber-500/50 transition-all"
                            >
                                <span>Register New Institute</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                            {/* Returning Head Teacher */}
                            <button
                                onClick={() => signIn("google", { callbackUrl: "/" })}
                                className="w-full flex items-center justify-between px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm hover:bg-white/10 hover:text-white transition-all"
                            >
                                <span>Sign In with Google</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Student / Teacher Path */}
                    <div className="group relative flex flex-col gap-5 p-7 rounded-2xl bg-white/5 border border-purple-500/20 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all duration-300">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 group-hover:bg-purple-500/20 transition-colors">
                                <GraduationCap className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Student / Teacher</h2>
                                <p className="text-sm text-gray-400 mt-1">
                                    Your institute has already registered you. Sign in with the Google account your Head Teacher added.
                                </p>
                            </div>
                        </div>

                        <ul className="space-y-2 text-sm text-gray-500">
                            <li className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-purple-500/70 shrink-0" />Access lectures and course material</li>
                            <li className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-purple-500/70 shrink-0" />Upload notes and get AI feedback</li>
                            <li className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-purple-500/70 shrink-0" />Track your learning analytics</li>
                        </ul>

                        <div className="mt-auto">
                            <button
                                onClick={() => signIn("google", { callbackUrl: "/" })}
                                className="cursor-pointer group/btn relative w-full px-5 py-3.5 bg-white text-black font-semibold rounded-xl overflow-hidden hover:scale-[1.02] transition-transform duration-300 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] flex items-center justify-between"
                            >
                                <span>Sign In with Google</span>
                                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover/btn:translate-x-[200%] transition-transform duration-1000 pointer-events-none" />
                            </button>
                            <p className="text-xs text-gray-600 text-center mt-3">
                                Your email must be pre-registered by your Head Teacher.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bottom tagline */}
                <p className="text-center text-sm text-gray-600">
                    Data is fully isolated per institute. Your information is never shared between schools.
                </p>
            </div>
        </div>
    );
}
