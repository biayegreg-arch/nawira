'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useOnboardingDraft, clearOnboardingDraft } from '@/lib/onboarding-draft';
import { cn } from '@/lib/utils';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (checked: boolean) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  locked,
  onChange,
}: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white p-4">
      <div>
        <p className="font-medium text-navy">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={locked}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export default function OnboardingConsentPage(): React.JSX.Element {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const [assistantHistory, setAssistantHistory] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onAccept(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: {
          birthDate: draft.birthDate,
          goal: draft.goal,
          lastPeriodDate: draft.lastPeriodDate,
          usualPeriodLength: draft.usualPeriodLength,
          usualCycleLength: draft.usualCycleLength,
          trackedConcerns: draft.trackedConcerns,
          consents: {
            ACCOUNT: true,
            HEALTH_DATA: true,
            ASSISTANT_HISTORY: assistantHistory,
            ANALYTICS: analytics,
            MARKETING: marketing,
          },
        },
      });
      clearOnboardingDraft();
      router.push('/onboarding/notifications');
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Certaines réponses sont invalides. Reviens en arrière et vérifie.',
          UNDER_MINIMUM_AGE: 'NAWIRA n’est pas encore disponible pour les moins de 18 ans.',
          PROFILE_ALREADY_EXISTS: 'Ton profil existe déjà.',
        };
        setError(map[err.code] ?? 'Une erreur est survenue.');
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const backHref =
    draft.goal === 'TRYING_TO_CONCEIVE' ? '/onboarding/baby-project' : '/onboarding/concerns';

  return (
    <OnboardingLayout step={9} backHref={backHref}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Ta confidentialité</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Voici comment NAWIRA utilise tes données. Tu peux changer d&rsquo;avis à tout moment.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Compte"
            description="Nécessaire pour créer et sécuriser ton compte."
            checked
            locked
          />
          <ToggleRow
            label="Données de santé"
            description="Nécessaire pour suivre ton cycle et fournir le service."
            checked
            locked
          />
          <ToggleRow
            label="Historique de l'assistant"
            description="Garder l'historique de tes échanges avec l'assistant NAWIRA."
            checked={assistantHistory}
            onChange={setAssistantHistory}
          />
          <ToggleRow
            label="Analytique"
            description="Nous aider à améliorer NAWIRA de façon anonymisée."
            checked={analytics}
            onChange={setAnalytics}
          />
          <ToggleRow
            label="Marketing"
            description="Recevoir des offres et actualités NAWIRA."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={onAccept} disabled={submitting} className="w-full">
          {submitting ? 'Enregistrement…' : 'Accepter'}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
