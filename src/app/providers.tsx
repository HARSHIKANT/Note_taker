"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User, Session } from "@supabase/supabase-js";
import type { AppUser } from "@/lib/types";

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    appUser: AppUser | null;
    loading: boolean;
    signOut: () => Promise<void>;
    refreshAppUser: () => Promise<void>;
    /** true when the user logged in via Google (has Drive permission) */
    hasGoogleDrive: boolean;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    session: null,
    appUser: null,
    loading: true,
    signOut: async () => {},
    refreshAppUser: async () => {},
    hasGoogleDrive: false,
});

export function useAuth() {
    return useContext(AuthContext);
}

export default function Providers({ children }: { children: ReactNode }) {
    const supabase = createClient();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAppUser = useCallback(async (email: string) => {
        try {
            const res = await fetch("/api/user/me");
            if (res.ok) {
                const data = await res.json();
                setAppUser({
                    id: data.id ?? "",
                    email,
                    name: data.name ?? null,
                    avatar_url: data.avatar_url ?? null,
                    role: data.role ?? null,
                    class: data.class ?? null,
                    is_head_teacher: data.isHeadTeacher ?? false,
                    gemini_api_key: data.geminiApiKey ?? null,
                    enrolled_courses: data.enrolledCourses ?? null,
                    institute_id: data.instituteId ?? null,
                    assigned_subjects: data.assignedSubjects ?? null,
                    google_refresh_token: data.googleRefreshToken ?? null,
                });
            }
        } catch {
            // user/me may 404 for brand-new users — that's fine
        }
    }, []);

    useEffect(() => {
        const initSession = async () => {
            const {
                data: { session: currentSession },
            } = await supabase.auth.getSession();

            setSession(currentSession);
            setUser(currentSession?.user ?? null);

            if (currentSession?.user?.email) {
                await fetchAppUser(currentSession.user.email);
            }
            setLoading(false);
        };

        initSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);

            if (newSession?.user?.email) {
                await fetchAppUser(newSession.user.email);
            } else {
                setAppUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [supabase, fetchAppUser]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setAppUser(null);
        router.push("/");
        router.refresh();
    };

    const refreshAppUser = async () => {
        if (user?.email) {
            await fetchAppUser(user.email);
        }
    };

    const hasGoogleDrive = !!appUser?.google_refresh_token;

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                appUser,
                loading,
                signOut: handleSignOut,
                refreshAppUser,
                hasGoogleDrive,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
