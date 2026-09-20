'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

export default function OnboardingBabyProjectPage(): React.JSX.Element {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const isTryingToConceive = draft.goal === 'TRYING_TO_CONCEIVE';

  useEffect(() => {
    if (!isTryingToConceive) {
      router.replace('/onboarding/consent');
    }
  }, [isTryingToConceive, router]);

  if (!isTryingToConceive) {
    return <></>;
  }

  return (
    <OnboardingLayout step={8} backHref="/onboarding/concerns">
      <div className="flex flex-col gap-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-soft">
          <Heart className="h-7 w-7 text-rose" />
        </span>
        <div>
          <h1 className="font-headings text-xl font-bold leading-tight text-navy md:text-2xl">
            Projet bébé
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            NAWIRA peut t&rsquo;aider à repérer ta fenêtre de fertilité grâce à la température
            basale, la glaire cervicale et les tests d&rsquo;ovulation. Tu pourras enregistrer ces
            signaux au fil de tes cycles.
          </p>
        </div>
        <Button onClick={() => router.push('/onboarding/consent')} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
