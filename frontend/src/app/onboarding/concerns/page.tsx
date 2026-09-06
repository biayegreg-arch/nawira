'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const CONCERNS = [
  { key: 'PAIN', label: 'Douleurs' },
  { key: 'MOOD', label: 'Humeur' },
  { key: 'FATIGUE', label: 'Fatigue' },
  { key: 'SLEEP', label: 'Sommeil' },
  { key: 'PMS', label: 'SPM' },
  { key: 'IRREGULARITY', label: 'Irrégularité' },
  { key: 'OVULATION', label: 'Ovulation' },
];

export default function OnboardingConcernsPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<string[]>(draft.trackedConcerns);

  function toggle(key: string): void {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function onContinue(): void {
    update({ trackedConcerns: selected });
    router.push(
      draft.goal === 'TRYING_TO_CONCEIVE' ? '/onboarding/baby-project' : '/onboarding/consent',
    );
  }

  return (
    <OnboardingLayout step={7} backHref="/onboarding/cycle-length">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Que veux-tu suivre ?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Choisis tout ce qui t&rsquo;intéresse.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={cn(
                'rounded-full border px-4 py-3 text-sm font-medium',
                selected.includes(c.key)
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-white text-navy hover:bg-gray-50',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
