'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { staggerDelay } from '@/lib/utils';
import { CurrentPlanCard } from '@/components/billing/CurrentPlanCard';
import { PremiumPlansGrid } from '@/components/billing/PremiumPlansGrid';
import type { BillingPlan } from '@/components/billing/plans-data';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Puis-je changer de plan à tout moment ?',
    a: 'Les offres payantes ne sont pas encore actives. Quand elles le seront, tu pourras changer ou annuler ton abonnement librement, sans engagement.',
  },
  {
    q: 'Est-ce que j’aurai une période d’essai ?',
    a: 'C’est prévu pour le lancement des offres payantes, mais elles ne sont pas encore disponibles — reviens bientôt pour plus de détails.',
  },
  {
    q: 'Qu’est-ce qui est inclus dans le plan Projet Bébé ?',
    a: 'Le plan Projet Bébé inclut tout du plan NAWIRA Plus, plus le suivi de la température basale, de la glaire cervicale et des tests LH.',
  },
];

interface ProfileResponse {
  profile: { plan: BillingPlan['key'] };
}

interface PricingResponse {
  plans: Array<{ key: 'PLUS' | 'BABY'; priceFcfa: number }>;
}

export default function BillingPage(): React.JSX.Element | null {
  const user = useUser();
  const [plan, setPlan] = useState<BillingPlan['key'] | null>(null);
  const [prices, setPrices] = useState<Partial<Record<'PLUS' | 'BABY', number>>>({});
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const profileRes = await api<ProfileResponse>('/api/profile');
      setPlan(profileRes.profile.plan);
      track('paywall_viewed', { paywall_id: 'billing_page', plan: 'PLUS' });
    } catch {
      setError(true);
      return;
    }
    try {
      const pricingRes = await api<PricingResponse>('/api/pricing');
      setPrices(Object.fromEntries(pricingRes.plans.map((p) => [p.key, p.priceFcfa])));
    } catch {
      // Pricing fetch failure falls back to the static BILLING_PLANS prices
      // already baked into PremiumPlansGrid (prices[plan.key] ?? plan.priceFcfa)
      // — never blocks the page.
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return null;

  if (error) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton abonnement. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (plan === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">💳</span>
          Abonnement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gère ton plan et découvre les offres à venir.
        </p>
      </div>

      <div className="animate-fade-in-up mb-8 max-w-3xl">
        <CurrentPlanCard plan={plan} />
      </div>

      <div className="animate-fade-in-up mb-8" style={staggerDelay(1)}>
        <PremiumPlansGrid currentPlan={plan} prices={prices} />
      </div>

      <div
        className="animate-fade-in-up rounded-lg border border-border bg-primary-soft p-6"
        style={staggerDelay(2)}
      >
        <h3 className="mb-4 text-base font-bold text-navy">Questions fréquentes</h3>
        <div className="flex flex-col gap-4">
          {FAQS.map((faq) => (
            <div key={faq.q}>
              <div className="mb-1 text-sm font-semibold text-navy">{faq.q}</div>
              <p className="text-sm text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
