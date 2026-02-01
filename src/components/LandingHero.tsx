
"use client";

import { signIn } from "next-auth/react";
import { ArrowRight, Cloud, Lock, Sparkles } from "lucide-react";

export function LandingHero() {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full animate-pulse delay-1000" />
            </div>

            <div className="z-10 max-w-4xl px-6 text-center space-y-8 animate-in fade-in zoom-in duration-700">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-sm font-medium text-gray-300">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>The Ultimate Student Companion</span>
                </div>

                <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40">
                    Note Taker
                </h1>

                <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                    Seamlessly capture and sync your handwritten notes to Google Drive.
                    Organized by subject, secured by Google.
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-8">
                    <button
                        onClick={() => signIn("google")}
                        className="group relative px-8 py-4 bg-white text-black font-semibold rounded-xl overflow-hidden hover:scale-105 transition-transform duration-300 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                        <div className="flex items-center gap-3">
                            <span>Sign in with Google</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                    </button>
                </div>

                <div className="pt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                    {[
                        { icon: Cloud, title: "Auto-Sync", desc: "Instantly saved to your Drive" },
                        { icon: Lock, title: "Private & Secure", desc: "Your data stays yours" },
                        { icon: Sparkles, title: "Smart Org", desc: "Auto-sorted by Subject" }
                    ].map((feature, i) => (
                        <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                            <feature.icon className="w-6 h-6 text-gray-400" />
                            <h3 className="text-lg font-semibold">{feature.title}</h3>
                            <p className="text-sm text-gray-500">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
