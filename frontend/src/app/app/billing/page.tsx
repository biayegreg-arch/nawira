'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { track } from '@/lib/analytics';
import { staggerDelay } from '@/lib/utils';
import { CurrentPlanCard } from '@/components/billing/CurrentPlanCard';
import { CouponBox, type AppliedCoupon } from '@/components/billing/CouponBox';
import { PremiumPlansGrid } from '@/components/billing/PremiumPlansGrid';
import type { BillingPlan } from '@/components/billing/plans-data';

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Comment passer à un plan payant ?',
    a: 'NAWIRA n’a pas encore de paiement en ligne intégré. Saisis ton éventuel code promo pour voir le prix réduit, puis clique sur « Demander ce plan » : ton code est joint à ta demande et l’équipe NAWIRA active ton plan manuellement.',
  },
  {
    q: 'Puis-je changer ou annuler mon plan ?',
    a: 'Oui, écris à support@nawira.app à tout moment — l’équipe ajuste ou retire ton plan sans frais.',
  },
  {
    q: 'Qu’est-ce qui est inclus dans le plan Projet Bébé ?',
    a: 'Le plan Projet Bébé inclut tout du plan NAWIRA Plus, plus le suivi de la température basale, de la glaire cervicale et des tests LH.',
  },
];

interface ProfileResponse {
  profile: { plan: BillingPlan['key']; planExpiresAt: string | null };
}

interface PricingResponse {
  plans: Array<{ key: 'PLUS' | 'BABY'; priceFcfa: number }>;
}

export default function BillingPage(): React.JSX.Element | null {
  const user = useUser();
  const [plan, setPlan] = useState<BillingPlan['key'] | null>(null);
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null);
  const [prices, setPrices] = useState<Partial<Record<'PLUS' | 'BABY', number>>>({});
  const [error, setError] = useState(false);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const profileRes = await api<ProfileResponse>('/api/profile');
      setPlan(profileRes.profile.plan);
      setPlanExpiresAt(profileRes.profile.planExpiresAt);
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
      <div className="px-4 py-6 sm:px-6 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton abonnement. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (plan === null) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:p-8">
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold leading-tight text-navy md:text-3xl">
          <span className="text-2xl md:text-3xl">💳</span>
          Abonnement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gère ton plan et découvre les offres NAWIRA.
        </p>
      </div>

      <div className="animate-fade-in-up mb-8 max-w-3xl">
        <CurrentPlanCard plan={plan} planExpiresAt={planExpiresAt} />
      </div>

      <div className="animate-fade-in-up mb-8" style={staggerDelay(1)}>
        {plan !== 'BABY' && (
          <div className="mb-6">
            <CouponBox applied={coupon} onApply={setCoupon} />
          </div>
        )}
        <PremiumPlansGrid currentPlan={plan} prices={prices} coupon={coupon} />
      </div>

      <div
        className="animate-fade-in-up rounded-lg border border-border bg-primary-soft p-4 sm:p-6"
        style={staggerDelay(2)}
      >
        <h3 className="mb-4 text-base font-bold md:text-lg text-navy">Questions fréquentes</h3>
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
