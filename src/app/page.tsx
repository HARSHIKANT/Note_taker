
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LandingHero } from "@/components/LandingHero";
import { StudentDashboard } from "@/components/StudentDashboard";
import { TeacherDashboard } from "@/components/TeacherDashboard";
import { UnregisteredScreen } from "@/components/UnregisteredScreen";
import { supabase } from "@/lib/supabase";

// Always run fresh — never serve a cached version of this page
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user?.email) {
    return <LandingHero />;
  }

  // Read the CURRENT state of the user directly from the DB
  // (bypasses caching so curriculum changes are always reflected immediately)
  const { data: dbUser } = await supabase
    .from("users")
    .select("role, class, enrolled_courses, assigned_subjects, is_head_teacher")
    .eq("email", user.email)
    .single();

  const role = dbUser?.role ?? null;

  // Signed in but not recognised in our system at all
  if (!role) {
    return <UnregisteredScreen />;
  }

  const hasClass = !!dbUser?.class;
  const hasCourses = Array.isArray(dbUser?.enrolled_courses) && dbUser!.enrolled_courses!.length > 0;
  const hasSubjects = Array.isArray(dbUser?.assigned_subjects) && dbUser!.assigned_subjects!.length > 0;

  // Student: redirect to setup if no curriculum chosen yet
  if (role === "student" && !hasClass && !hasCourses) {
    redirect("/role-select");
  }

  // Teacher: redirect to setup if no subjects/courses chosen yet
  if (role === "teacher" && !hasSubjects && !hasCourses) {
    redirect("/role-select");
  }

  if (role === "teacher") {
    return <TeacherDashboard />;
  }

  return <StudentDashboard />;
}
