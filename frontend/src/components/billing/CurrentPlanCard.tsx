import { CheckCircle2 } from 'lucide-react';
import { PLAN_LABELS, type BillingPlan } from '@/components/billing/plans-data';

interface CurrentPlanCardProps {
  plan: BillingPlan['key'];
}

export function CurrentPlanCard({ plan }: CurrentPlanCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-white p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-navy md:text-xl">Plan actuel</h2>
          <p className="mt-1 text-sm text-muted-foreground">{PLAN_LABELS[plan]}</p>
        </div>
        <span className="shrink-0 text-2xl md:text-3xl">🎁</span>
      </div>

      <div className="rounded-lg border border-border bg-green-soft/40 p-4">
        <div className="flex gap-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" />
          <p className="text-sm leading-relaxed text-navy">
            NAWIRA vient d&rsquo;être lancé : toutes les fonctionnalités déjà disponibles dans
            l&rsquo;application sont débloquées pour tout le monde, quel que soit le plan, tant que
            les offres payantes ne sont pas encore actives.
          </p>
        </div>
      </div>
    </div>
  );
}
