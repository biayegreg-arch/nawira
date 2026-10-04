'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { track, ONBOARDING_START_KEY } from '@/lib/analytics';

export default function OnboardingWelcomePage(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    sessionStorage.setItem(ONBOARDING_START_KEY, String(Date.now()));
    track('onboarding_started', {});
  }, []);

  return (
    <OnboardingLayout step={1}>
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <Logo size={64} />
        <div>
          <h1 className="font-headings text-2xl font-bold leading-tight text-navy md:text-3xl">
            Bienvenue sur NAWIRA
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Comprends ton cycle. Apprends à connaître ton corps.
          </p>
        </div>
        <Button onClick={() => router.push('/onboarding/birth-date')} className="w-full">
          Commencer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
