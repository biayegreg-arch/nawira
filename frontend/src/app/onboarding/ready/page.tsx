'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

export default function OnboardingReadyPage(): React.JSX.Element {
  const router = useRouter();
  const { refresh } = useAuth();
  const [entering, setEntering] = useState(false);

  async function onEnterDashboard(): Promise<void> {
    setEntering(true);
    // The Profile row was created back in /onboarding/consent, but the
    // AuthContext user cached at login/signup still has hasProfile=false.
    // /app/layout.tsx reads that cached value (not a refetch) to gate
    // access — without this refresh it bounces straight back to
    // /onboarding/welcome. Refreshed here, at the last onboarding step,
    // so it doesn't fire mid-flow: onboarding/layout.tsx itself redirects
    // to /app/today as soon as hasProfile is true, which would skip the
    // notifications/ready screens if refreshed any earlier.
    await refresh();
    router.push('/app/today');
  }

  return (
    <OnboardingLayout step={11}>
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-soft">
          <PartyPopper className="h-8 w-8 text-green" />
        </span>
        <div>
          <h1 className="font-headings text-2xl font-bold text-navy">Ton profil est prêt !</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enregistre tes prochaines règles pour voir apparaître tes premières estimations de cycle
            et de fenêtre fertile.
          </p>
        </div>
        <Button onClick={() => void onEnterDashboard()} disabled={entering} className="w-full">
          {entering ? 'Un instant…' : 'Voir mon tableau de bord'}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
