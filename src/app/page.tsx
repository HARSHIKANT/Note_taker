
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LandingHero } from "@/components/LandingHero";
import { StudentDashboard } from "@/components/StudentDashboard";
import { TeacherDashboard } from "@/components/TeacherDashboard";
import type { ExtendedSession } from "@/lib/types";

export default async function Home() {
  const session = (await auth()) as ExtendedSession | null;

  if (!session) {
    return <LandingHero />;
  }

  // New user without a role — go pick one
  if (!session.role) {
    redirect("/role-select");
  }

  if (session.role === "teacher") {
    return <TeacherDashboard />;
  }

  return <StudentDashboard />;
}
