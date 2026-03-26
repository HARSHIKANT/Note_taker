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
        async jwt({ token, account, profile, trigger }) {
            if (account) {
                token.accessToken = account.access_token;

                // Upsert user into Supabase on first sign-in
                const email = profile?.email || token.email;
                const name = profile?.name || token.name;
                const avatar = (profile as any)?.picture || token.picture;

                if (email) {
                    const { data: existingUser } = await supabase
                        .from("users")
                        .select("id, role, class, is_head_teacher")
                        .eq("email", email)
                        .single();

                    if (existingUser) {
                        token.userId = existingUser.id;
                        token.role = existingUser.role;
                        token.class = existingUser.class;
                        token.isHeadTeacher = existingUser.is_head_teacher ?? false;
                    } else {
                        const { data: newUser } = await supabase
                            .from("users")
                            .insert({ email, name, avatar_url: avatar })
                            .select("id")
                            .single();

                        if (newUser) {
                            token.userId = newUser.id;
                            token.role = null;
                            token.class = null;
                        }
                    }
                }
            }

            // Re-fetch role from Supabase when session is updated or role is missing
            // This handles the case after the user sets their role via the API
            if ((trigger === "update" || !token.role) && token.email) {
                const { data: user } = await supabase
                    .from("users")
                    .select("id, role, class, is_head_teacher")
                    .eq("email", token.email as string)
                    .single();

                if (user) {
                    token.userId = user.id;
                    token.role = user.role;
                    token.class = user.class;
                    token.isHeadTeacher = user.is_head_teacher ?? false;
                }
            }

            return token;
        },

        async session({ session, token }) {
            const t = token as ExtendedToken;
            return {
                ...session,
                accessToken: t.accessToken,
                userId: t.userId,
                role: t.role,
                class: t.class,
                isHeadTeacher: t.isHeadTeacher ?? false,
            };
        },
    },
});
