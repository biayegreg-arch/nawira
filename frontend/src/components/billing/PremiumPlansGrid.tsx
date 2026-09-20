import { Check } from 'lucide-react';
import { BILLING_PLANS, type BillingPlan } from '@/components/billing/plans-data';
import { staggerDelay } from '@/lib/utils';

function formatFcfa(amount: number): string {
  if (amount === 0) return 'Gratuit';
  return `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
}

const PLAN_RANK: Record<BillingPlan['key'], number> = { FREE: 0, PLUS: 1, BABY: 2 };

interface PremiumPlansGridProps {
  currentPlan: BillingPlan['key'];
  prices: Partial<Record<'PLUS' | 'BABY', number>>;
}

export function PremiumPlansGrid({
  currentPlan,
  prices,
}: PremiumPlansGridProps): React.JSX.Element {
  return (
    <div>
      <h2 className="mb-5 text-lg font-bold text-navy">Nos plans</h2>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BILLING_PLANS.map((plan, i) => (
          <div
            key={plan.key}
            className={`animate-fade-in-up relative flex flex-col rounded-lg border p-6 transition-shadow duration-200 hover:shadow-md ${
              plan.highlighted ? 'border-primary bg-primary-soft' : 'border-border bg-gray-50'
            }`}
            style={staggerDelay(i)}
          >
            {plan.highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary">
                Populaire
              </div>
            )}

            <h3 className="text-base font-bold text-navy">{plan.name}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{plan.promise}</p>

            <div className="mb-4 border-b border-border pb-4">
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-navy">
                  {formatFcfa(plan.key === 'FREE' ? 0 : (prices[plan.key] ?? plan.priceFcfa))}
                </span>
                {plan.key !== 'FREE' && (
                  <span className="ml-1 text-xs text-muted-foreground">/mois</span>
                )}
              </div>
            </div>

            <div className="mb-5 flex flex-1 flex-col gap-2">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <Check size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>

            {plan.key === currentPlan ? (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Plan actuel
              </button>
            ) : PLAN_RANK[plan.key] < PLAN_RANK[currentPlan] ? (
              // Already on a higher tier: nothing to request. (A downgrade is
              // an admin action, not a self-service one.)
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-muted-foreground"
              >
                {plan.key === 'FREE' ? 'Inclus par défaut' : 'Inclus dans ton plan'}
              </button>
            ) : (
              <a
                href={`mailto:support@nawira.app?subject=${encodeURIComponent(
                  `Demande de passage au plan ${plan.name}`,
                )}`}
                className="block w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Demander ce plan
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
