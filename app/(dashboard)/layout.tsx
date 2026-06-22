import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import TrialManager from "@/components/TrialManager";
import { GuidedTourProvider } from "@/components/ui/GuidedTour";
import { getCachedUser, getCachedUserProfile } from "@/lib/server-auth";
import { hasInternalAccess } from "@/lib/internal-access";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser()

  // Preview deployments use the same server-side email allowlist principle as
  // the internal Admin, Market, and Compare pages. Production is unaffected.
  if (process.env.VERCEL_ENV === 'preview') {
    if (!user) redirect('/login')
    if (!hasInternalAccess(user.email)) redirect('/preview-access-denied')
  }

  let initialTrialStatus: React.ComponentProps<typeof TrialManager>['initialTrialStatus'] = null

  if (user) {
    const profile = await getCachedUserProfile(user.id)
    const status = profile?.subscription_status ?? 'free'
    initialTrialStatus = {
      isPro: status === 'active' || status === 'trialing',
      trialUsed: profile?.trial_used ?? true,
      trialStartedAt: profile?.trial_started_at ?? null,
      trialExtensionStartedAt: profile?.trial_extension_started_at ?? null,
      hasPhone: !!profile?.phone_number,
    }
  }

  return (
    <GuidedTourProvider>
      <div className="min-h-screen bg-black flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
        <TrialManager initialTrialStatus={initialTrialStatus} />
      </div>
    </GuidedTourProvider>
  );
}
