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
                    const { data: existingUser } = await supabase
                        .from("users")
                        .select("id, role, class, is_head_teacher, gemini_api_key")
                        .eq("email", email)
                        .single();

                    if (existingUser) {
                        extendedToken.userId = existingUser.id;
                        extendedToken.role = existingUser.role;
                        extendedToken.class = existingUser.class;
                        extendedToken.isHeadTeacher = existingUser.is_head_teacher ?? false;
                        extendedToken.geminiApiKey = existingUser.gemini_api_key ?? null;
                    } else {
                        const { data: newUser } = await supabase
                            .from("users")
                            .insert({ email, name, avatar_url: avatar })
                            .select("id")
                            .single();

                        if (newUser) {
                            extendedToken.userId = newUser.id;
                            extendedToken.role = null;
                            extendedToken.class = null;
                        }
                    }
                }
            }

            // 2) Re-fetch role from Supabase when session is updated, role is missing,
            //    or geminiApiKey has never been loaded (preexisting sessions)
            if ((trigger === "update" || !extendedToken.role || extendedToken.geminiApiKey === undefined) && extendedToken.email) {
                const { data: user } = await supabase
                    .from("users")
                    .select("id, role, class, is_head_teacher, gemini_api_key")
                    .eq("email", extendedToken.email as string)
                    .single();

                if (user) {
                    extendedToken.userId = user.id;
                    extendedToken.role = user.role;
                    extendedToken.class = user.class;
                    extendedToken.isHeadTeacher = user.is_head_teacher ?? false;
                    extendedToken.geminiApiKey = user.gemini_api_key ?? null;
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
            };
        },
    },
});
