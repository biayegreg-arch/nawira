import { CheckCircle2, Clock } from 'lucide-react';
import { PLAN_LABELS, type BillingPlan } from '@/components/billing/plans-data';

interface CurrentPlanCardProps {
  plan: BillingPlan['key'];
  planExpiresAt: string | null;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function CurrentPlanCard({ plan, planExpiresAt }: CurrentPlanCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-navy">Plan actuel</h2>
          <p className="mt-1 text-sm text-muted-foreground">{PLAN_LABELS[plan]}</p>
        </div>
        <span className="text-3xl">🎁</span>
      </div>

      {plan !== 'FREE' && planExpiresAt && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-primary-soft p-3 text-sm text-navy">
          <Clock size={14} className="shrink-0 text-primary" />
          Actif jusqu&rsquo;au {formatExpiry(planExpiresAt)}
        </div>
      )}

      <div className="rounded-lg border border-border bg-green-soft/40 p-4">
        <div className="flex gap-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" />
          <p className="text-sm leading-relaxed text-navy">
            NAWIRA n&rsquo;a pas encore de paiement en ligne : toutes les fonctionnalités déjà
            disponibles dans l&rsquo;application restent débloquées pour tout le monde, quel que
            soit le plan. Un plan payant est attribué manuellement par l&rsquo;équipe NAWIRA sur
            demande.
          </p>
        </div>
      </div>
    </div>
  );
}
