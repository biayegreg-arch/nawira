'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: '3 jours', value: 3 },
  { label: '4 jours', value: 4 },
  { label: '5 jours', value: 5 },
  { label: '6 jours', value: 6 },
  { label: '7+ jours', value: 7 },
  { label: 'Je ne sais pas', value: null },
];

export default function OnboardingPeriodLengthPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<number | null>(draft.usualPeriodLength);

  function onContinue(): void {
    update({ usualPeriodLength: selected });
    router.push('/onboarding/cycle-length');
  }

  return (
    <OnboardingLayout step={5} backHref="/onboarding/last-period">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Combien de temps durent tes règles ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            En moyenne, sur les derniers cycles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={cn(
                'rounded-full border px-4 py-3 text-sm font-medium',
                selected === opt.value
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-white text-navy hover:bg-gray-50',
              )}
            >
              {opt.label}
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
