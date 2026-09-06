'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Droplet, BookOpen, Heart } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft, type OnboardingDraft } from '@/lib/onboarding-draft';

const GOALS: Array<{
  value: NonNullable<OnboardingDraft['goal']>;
  title: string;
  icon: ReactNode;
}> = [
  {
    value: 'PERIOD_TRACKING',
    title: 'Suivre mes règles',
    icon: <Droplet className="h-5 w-5 text-primary" />,
  },
  {
    value: 'UNDERSTAND_CYCLE',
    title: 'Comprendre mon cycle',
    icon: <BookOpen className="h-5 w-5 text-primary" />,
  },
  {
    value: 'TRYING_TO_CONCEIVE',
    title: 'Projet bébé',
    icon: <Heart className="h-5 w-5 text-primary" />,
  },
];

export default function OnboardingGoalPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [goal, setGoal] = useState<OnboardingDraft['goal']>(draft.goal);

  function onContinue(): void {
    if (!goal) return;
    update({ goal });
    router.push('/onboarding/last-period');
  }

  return (
    <OnboardingLayout step={3} backHref="/onboarding/birth-date">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Quel est ton objectif ?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tu pourras changer d&rsquo;avis plus tard.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {GOALS.map((g) => (
            <OptionCard
              key={g.value}
              selected={goal === g.value}
              onClick={() => setGoal(g.value)}
              icon={g.icon}
              title={g.title}
            />
          ))}
        </div>
        <Button onClick={onContinue} disabled={!goal} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
