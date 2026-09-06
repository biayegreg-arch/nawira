import { PartyPopper } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { LinkButton } from '@/components/ui/Button';

export default function OnboardingReadyPage(): React.JSX.Element {
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
        <LinkButton href="/app/today" className="w-full">
          Voir mon tableau de bord
        </LinkButton>
      </div>
    </OnboardingLayout>
  );
}
