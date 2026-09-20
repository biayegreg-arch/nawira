'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Skeleton } from '@/components/ui/Skeleton';

interface PricingPlanRow {
  key: 'PLUS' | 'BABY';
  priceFcfa: number;
  updatedAt: string;
  updatedBy: string | null;
}

const PLAN_TITLES: Record<PricingPlanRow['key'], string> = {
  PLUS: 'NAWIRA Plus',
  BABY: 'Projet Bébé',
};

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'PLAN_NOT_FOUND':
      return 'Plan tarifaire introuvable.';
    case 'VALIDATION_FAILED':
      return 'Prix invalide.';
    default:
      return err.message;
  }
}

export default function AdminPricingPage(): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const canWrite = admin.can.includes('pricing:write');

  const [plans, setPlans] = useState<PricingPlanRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ plans: PricingPlanRow[] }>('/api/admin/pricing-plans');
      setPlans(res.plans);
      setDrafts(Object.fromEntries(res.plans.map((p) => [p.key, String(p.priceFcfa)])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: PricingPlanRow['key']): Promise<void> {
    const priceFcfa = Number.parseInt(drafts[key] ?? '', 10);
    if (!Number.isFinite(priceFcfa) || priceFcfa < 0) {
      toast('Prix invalide.', 'error');
      return;
    }
    setBusyKey(key);
    try {
      const res = await api<{ plan: PricingPlanRow }>(`/api/admin/pricing-plans/${key}`, {
        method: 'PATCH',
        body: { priceFcfa },
      });
      setPlans((prev) => (prev ? prev.map((p) => (p.key === key ? res.plan : p)) : prev));
      toast('Prix mis à jour.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold leading-tight text-navy md:text-3xl">Tarifs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prix FCFA des plans NAWIRA Plus et Projet Bébé.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {plans === null ? (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {plans.map((plan) => (
            <div key={plan.key} className="rounded-xl border border-border bg-white p-4 sm:p-5">
              <h2 className="text-base font-bold text-navy">{PLAN_TITLES[plan.key]}</h2>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Modifié le {new Date(plan.updatedAt).toLocaleDateString('fr-FR')}
                {plan.updatedBy ? ` par ${plan.updatedBy}` : ''}
              </p>

              {canWrite ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1_000_000}
                    value={drafts[plan.key] ?? ''}
                    disabled={busyKey === plan.key}
                    onChange={(e) => setDrafts((d) => ({ ...d, [plan.key]: e.target.value }))}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-base text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:w-32 sm:flex-none md:text-sm"
                  />
                  <span className="text-sm text-muted-foreground">FCFA</span>
                  <button
                    type="button"
                    disabled={busyKey === plan.key}
                    onClick={() => void save(plan.key)}
                    className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:ml-auto sm:w-auto"
                  >
                    Enregistrer
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-2xl font-bold text-navy">
                  {new Intl.NumberFormat('fr-FR').format(plan.priceFcfa)} FCFA
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
