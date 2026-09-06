'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const CYCLE_DAYS = [26, 27, 28, 29, 30, 31, 32];

export default function OnboardingCycleLengthPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<number | null>(draft.usualCycleLength);

  function onContinue(): void {
    update({ usualCycleLength: selected });
    router.push('/onboarding/concerns');
  }

  const chipClass = (isSelected: boolean): string =>
    cn(
      'rounded-full border px-4 py-3 text-sm font-medium',
      isSelected
        ? 'border-primary bg-primary-soft text-primary'
        : 'border-border bg-white text-navy hover:bg-gray-50',
    );

  return (
    <OnboardingLayout step={6} backHref="/onboarding/period-length">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Quelle est la durée habituelle de ton cycle ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Du premier jour des règles au premier jour des règles suivantes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CYCLE_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setSelected(days)}
              className={chipClass(selected === days)}
            >
              {days} j
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={chipClass(selected === null)}
          >
            Irrégulier
          </button>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={chipClass(selected === null)}
          >
            Je ne sais pas
          </button>
        </div>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
