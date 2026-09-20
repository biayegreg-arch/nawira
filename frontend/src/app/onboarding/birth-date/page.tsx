'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';
import { isAdult } from '@/lib/age';

export default function OnboardingBirthDatePage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [birthDate, setBirthDate] = useState(draft.birthDate ?? '');
  const [touched, setTouched] = useState(false);

  const isValidDate = birthDate.length > 0 && !Number.isNaN(Date.parse(birthDate));
  const isOfAge = isValidDate && isAdult(birthDate);
  const showUnderageError = touched && isValidDate && !isOfAge;

  function onContinue(): void {
    update({ birthDate });
    router.push('/onboarding/goal');
  }

  return (
    <OnboardingLayout step={2} backHref="/onboarding/welcome">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold leading-tight text-navy md:text-2xl">
            Ta date de naissance
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            NAWIRA est réservé aux personnes de 18 ans et plus.
          </p>
        </div>
        <Field
          label="Date de naissance"
          type="date"
          name="birthDate"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          onBlur={() => setTouched(true)}
          max={new Date().toISOString().slice(0, 10)}
        />
        {showUnderageError && (
          <p role="alert" className="text-sm text-red-600">
            NAWIRA n&rsquo;est pas encore disponible pour les moins de 18 ans.
          </p>
        )}
        <Button onClick={onContinue} disabled={!isOfAge} className="min-h-12 w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
