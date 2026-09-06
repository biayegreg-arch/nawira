'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

export default function OnboardingLastPeriodPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [lastPeriodDate, setLastPeriodDate] = useState(draft.lastPeriodDate ?? '');
  const [unknown, setUnknown] = useState(false);

  function onContinue(): void {
    update({ lastPeriodDate: unknown ? null : lastPeriodDate || null });
    router.push('/onboarding/period-length');
  }

  return (
    <OnboardingLayout step={4} backHref="/onboarding/goal">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Quand ont commencé tes dernières règles ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Facultatif — tu peux l&rsquo;ignorer.
          </p>
        </div>
        <Field
          label="Date de dernières règles"
          type="date"
          name="lastPeriodDate"
          value={lastPeriodDate}
          onChange={(e) => {
            setLastPeriodDate(e.target.value);
            setUnknown(false);
          }}
          max={new Date().toISOString().slice(0, 10)}
          disabled={unknown}
        />
        <button
          type="button"
          onClick={() => {
            setUnknown(true);
            setLastPeriodDate('');
          }}
          className="min-h-11 text-left text-sm font-medium text-primary underline"
        >
          Je ne sais pas
        </button>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
