import { Check } from 'lucide-react';
import { BILLING_PLANS, type BillingPlan } from '@/components/billing/plans-data';
import { staggerDelay } from '@/lib/utils';

function formatFcfa(amount: number): string {
  if (amount === 0) return 'Gratuit';
  return `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
}

interface PremiumPlansGridProps {
  currentPlan: BillingPlan['key'];
}

export function PremiumPlansGrid({ currentPlan }: PremiumPlansGridProps): React.JSX.Element {
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
                <span className="text-2xl font-bold text-navy">{formatFcfa(plan.priceFcfa)}</span>
                {plan.priceFcfa > 0 && (
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

            <button
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              {plan.key === currentPlan ? 'Plan actuel' : 'Bientôt disponible'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
