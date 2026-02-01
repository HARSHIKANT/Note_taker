
import { auth } from "@/lib/auth";
import { LandingHero } from "@/components/LandingHero";
import { UploadDashboard } from "@/components/UploadDashboard";

export default async function Home() {
  const session = await auth();

  if (!session) {
    return <LandingHero />;
  }

  return <UploadDashboard />;
}
