import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { supabase } from "@/lib/supabase";
import { ExtendedToken } from "@/lib/types";

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope:
                        "openid email profile https://www.googleapis.com/auth/drive.file",
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile, trigger, session }) {
            const extendedToken = token as ExtendedToken;

            // 0) If client calls update({ geminiApiKey }), write it directly to the token
            if (trigger === "update" && session?.geminiApiKey !== undefined) {
                extendedToken.geminiApiKey = session.geminiApiKey ?? null;
                return extendedToken;
            }

            // 1) Initial Sign-In: Save access/refresh tokens from the Google account response
            if (account) {
                extendedToken.accessToken = account.access_token;
                extendedToken.refreshToken = account.refresh_token;
                extendedToken.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3500 * 1000;

                // Upsert user into Supabase on first sign-in
                const email = profile?.email || token.email;
                const name = profile?.name || token.name;
                const avatar = (profile as any)?.picture || token.picture;

                if (email) {
                    // Safe core query (always-existing columns)
                    const { data: existingUser } = await supabase
                        .from("users")
                        .select("id, role, class, is_head_teacher, gemini_api_key, enrolled_courses")
                        .eq("email", email)
                        .single();

                    if (existingUser) {
                        // REVOCATION CHECK: if role is null, the user was removed from the roster
                        // Leave token unset — page.tsx will show <UnregisteredScreen />
                        if (existingUser.role) {
                            extendedToken.userId = existingUser.id;
                            extendedToken.role = existingUser.role as "student" | "teacher";
                            extendedToken.class = existingUser.class;
                            extendedToken.isHeadTeacher = existingUser.is_head_teacher ?? false;
                            extendedToken.geminiApiKey = existingUser.gemini_api_key ?? null;
                            extendedToken.enrolledCourses = existingUser.enrolled_courses ?? null;

                            // Optional institute fields (only after migration)
                            try {
                                const { data: extUser } = await supabase
                                    .from("users")
                                    .select("institute_id, assigned_subjects")
                                    .eq("id", existingUser.id)
                                    .single();
                                if (extUser) {
                                    extendedToken.instituteId = extUser.institute_id ?? null;
                                    extendedToken.assignedSubjects = extUser.assigned_subjects ?? null;
                                    if (extUser.institute_id) {
                                        const { data: inst } = await supabase
                                            .from("institutes")
                                            .select("name")
                                            .eq("id", extUser.institute_id)
                                            .single();
                                        extendedToken.instituteName = inst?.name ?? null;
                                    }
                                }
                            } catch {
                                extendedToken.instituteId = null;
                                extendedToken.instituteName = null;
                                extendedToken.assignedSubjects = null;
                            }
                        }
                    } else {
                        // New user — check if they are pre-registered in any institute's roster
                        let rosterRole: string | null = null;
                        let rosterInstituteId: string | null = null;
                        let rosterInstituteName: string | null = null;

                        try {
                            const { data: rosterEntry } = await supabase
                                .from("institute_members")
                                .select("role, institute_id")
                                .eq("email", email)
                                .single();
                            if (rosterEntry) {
                                rosterRole = rosterEntry.role ?? null;
                                rosterInstituteId = rosterEntry.institute_id ?? null;
                                if (rosterInstituteId) {
                                    const { data: inst } = await supabase
                                        .from("institutes")
                                        .select("name")
                                        .eq("id", rosterInstituteId)
                                        .single();
                                    rosterInstituteName = inst?.name ?? null;
                                }
                            }
                        } catch {
                            // institute_members table doesn't exist yet
                        }

                        const { data: newUser } = await supabase
                            .from("users")
                            .insert({
                                email,
                                name,
                                avatar_url: avatar,
                                role: rosterRole,
                                institute_id: rosterInstituteId,
                                is_head_teacher: rosterRole === "head_teacher",
                            })
                            .select("id")
                            .single();

                        if (newUser) {
                            extendedToken.userId = newUser.id;
                            extendedToken.role = (rosterRole === "head_teacher" ? "teacher" : rosterRole) as "student" | "teacher" | null;
                            extendedToken.class = null;
                            extendedToken.isHeadTeacher = rosterRole === "head_teacher";
                            extendedToken.instituteId = rosterInstituteId;
                            extendedToken.instituteName = rosterInstituteName;
                            extendedToken.assignedSubjects = null;
                        }
                    }
                }
            }

            // 2) Re-fetch role from Supabase when session is updated, role is missing,
            //    or geminiApiKey has never been loaded (preexisting sessions)
            if ((trigger === "update" || !extendedToken.role || extendedToken.geminiApiKey === undefined) && extendedToken.email) {
                // Step 1: Always-safe core query (these columns existed before migration)
                const { data: user } = await supabase
                    .from("users")
                    .select("id, role, class, is_head_teacher, gemini_api_key, enrolled_courses")
                    .eq("email", extendedToken.email as string)
                    .single();

                if (user) {
                    extendedToken.userId = user.id;
                    extendedToken.role = user.role;
                    extendedToken.class = user.class;
                    extendedToken.isHeadTeacher = user.is_head_teacher ?? false;
                    extendedToken.geminiApiKey = user.gemini_api_key ?? null;
                    extendedToken.enrolledCourses = user.enrolled_courses ?? null;

                    // Step 2: Optional institute fields (only available after migration)
                    try {
                        const { data: extUser } = await supabase
                            .from("users")
                            .select("institute_id, assigned_subjects")
                            .eq("id", user.id)
                            .single();

                        if (extUser) {
                            extendedToken.instituteId = extUser.institute_id ?? null;
                            extendedToken.assignedSubjects = extUser.assigned_subjects ?? null;

                            // Step 3: Fetch institute name if we have an institute_id
                            if (extUser.institute_id) {
                                const { data: institute } = await supabase
                                    .from("institutes")
                                    .select("name")
                                    .eq("id", extUser.institute_id)
                                    .single();
                                extendedToken.instituteName = institute?.name ?? null;
                            }
                        }
                    } catch {
                        // Migration hasn't been run yet — institute fields are unavailable, which is fine
                        extendedToken.instituteId = null;
                        extendedToken.instituteName = null;
                        extendedToken.assignedSubjects = null;
                    }
                }
            }

            // 3) Token Rotation Logic
            // Return previous token if the access token has not expired yet
            if (extendedToken.accessTokenExpires && Date.now() < extendedToken.accessTokenExpires) {
                return extendedToken;
            }

            // Access token has expired, use the securely stored refresh token to get a new one
            if (extendedToken.refreshToken) {
                try {
                    console.log("Rotating expired Google OAuth token...");
                    const response = await fetch("https://oauth2.googleapis.com/token", {
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            client_id: process.env.GOOGLE_CLIENT_ID!,
                            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                            grant_type: "refresh_token",
                            refresh_token: extendedToken.refreshToken,
                        }),
                        method: "POST",
                    });

                    const tokens = await response.json();

                    if (!response.ok) throw tokens;

                    extendedToken.accessToken = tokens.access_token;
                    extendedToken.accessTokenExpires = Date.now() + tokens.expires_in * 1000;
                    if (tokens.refresh_token) {
                        extendedToken.refreshToken = tokens.refresh_token;
                    }
                } catch (error) {
                    console.error("Error refreshing Google access token", error);
                    extendedToken.error = "RefreshAccessTokenError";
                }
            }

            return extendedToken;
        },

        async session({ session, token }) {
            const t = token as ExtendedToken;
            return {
                ...session,
                accessToken: t.accessToken,
                error: t.error,
                userId: t.userId,
                role: t.role,
                class: t.class,
                isHeadTeacher: t.isHeadTeacher ?? false,
                geminiApiKey: t.geminiApiKey ?? null,
                enrolledCourses: t.enrolledCourses ?? null,
                instituteId: t.instituteId ?? null,
                instituteName: t.instituteName ?? null,
                assignedSubjects: t.assignedSubjects ?? null,
            };
        },
    },
});
