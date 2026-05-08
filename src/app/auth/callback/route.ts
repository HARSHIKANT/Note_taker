import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabase as adminSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.session) {
            // If the user signed in via Google, store the refresh token for Drive access
            const providerRefreshToken = data.session.provider_refresh_token;
            if (providerRefreshToken && data.session.user?.id) {
                await adminSupabase
                    .from("users")
                    .update({ google_refresh_token: providerRefreshToken })
                    .eq("id", data.session.user.id);
            }

            const forwardedHost = request.headers.get("x-forwarded-host");
            const isLocalEnv = process.env.NODE_ENV === "development";
            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`);
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`);
            } else {
                return NextResponse.redirect(`${origin}${next}`);
            }
        }
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
