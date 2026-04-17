"use client";

import { Building2, Mail } from "lucide-react";
import { signOut } from "next-auth/react";

export function UnregisteredScreen() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-red-400" />
            </div>
            <div className="space-y-2">
                <h1 className="text-2xl font-bold text-white">Email Not Registered</h1>
                <p className="text-neutral-400 max-w-sm">
                    Your Google account is not affiliated with any registered institute.
                    Ask your Head Teacher to add your email to the institute roster.
                </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-neutral-400">
                <Mail className="w-4 h-4 text-neutral-500" />
                <span>Once added, sign out and sign back in.</span>
            </div>
            <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-6 py-2.5 rounded-xl border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors text-sm"
            >
                Sign Out
            </button>
        </div>
    );
}
