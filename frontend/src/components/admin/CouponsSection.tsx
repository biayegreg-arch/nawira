'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Skeleton } from '@/components/ui/Skeleton';

interface CouponRow {
  id: string;
  code: string;
  percentOff: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'COUPON_CODE_TAKEN':
      return 'Ce code existe déjà.';
    case 'VALIDATION_FAILED':
      return 'Code (3–32 caractères : lettres, chiffres, - _) ou pourcentage (1–100) invalide.';
    case 'COUPON_NOT_FOUND':
      return 'Coupon introuvable.';
    default:
      return err.message;
  }
}

function isExpired(c: CouponRow): boolean {
  return c.expiresAt !== null && new Date(c.expiresAt) <= new Date();
}

export function CouponsSection({ canWrite }: { canWrite: boolean }): React.JSX.Element {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ coupons: CouponRow[] }>('/api/admin/coupons');
      setCoupons(res.coupons);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const percentOff = Number.parseInt(percent, 10);
    if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
      toast('Pourcentage invalide (1 à 100).', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ coupon: CouponRow }>('/api/admin/coupons', {
        method: 'POST',
        body: {
          code,
          percentOff,
          // Valid through the end of the chosen day (UTC).
          ...(expiresOn ? { expiresAt: `${expiresOn}T23:59:59.000Z` } : {}),
        },
      });
      setCoupons((prev) => [res.coupon, ...(prev ?? [])]);
      setCode('');
      setPercent('');
      setExpiresOn('');
      toast('Coupon créé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: CouponRow): Promise<void> {
    try {
      const res = await api<{ coupon: CouponRow }>(`/api/admin/coupons/${c.id}`, {
        method: 'PATCH',
        body: { active: !c.active },
      });
      setCoupons((prev) => prev?.map((x) => (x.id === c.id ? res.coupon : x)) ?? prev);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function remove(c: CouponRow): Promise<void> {
    if (!window.confirm(`Supprimer le coupon ${c.code} ?`)) return;
    try {
      await api(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
      setCoupons((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
      toast('Coupon supprimé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const inputClass =
    'rounded-lg border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary';

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-navy">Coupons de réduction</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Les utilisatrices saisissent un code sur la page Abonnement pour voir le prix réduit avant
        de demander leur plan.
      </p>

      {canWrite && (
        <form
          onSubmit={(e) => void create(e)}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-5"
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENUE20"
              maxLength={32}
              required
              className={`${inputClass} w-44 uppercase`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Réduction (%)
            <input
              type="number"
              min={1}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Expire le (optionnel)
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Créer le coupon
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-white">
        {coupons === null ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : coupons.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Aucun coupon pour le moment.</p>
        ) : (
          <ul className="divide-y divide-border">
            {coupons.map((c) => {
              const expired = isExpired(c);
              const live = c.active && !expired;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="font-mono text-sm font-semibold text-navy">{c.code}</span>
                  <span className="text-sm text-navy">−{c.percentOff}%</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      live ? 'bg-green-soft text-green' : 'bg-gray-100 text-muted-foreground'
                    }`}
                  >
                    {expired ? 'Expiré' : c.active ? 'Actif' : 'Désactivé'}
                  </span>
                  {c.expiresAt && (
                    <span className="text-xs text-muted-foreground">
                      jusqu’au {new Date(c.expiresAt).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                  {canWrite && (
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => void toggle(c)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gray-50"
                      >
                        {c.active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(c)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-bg"
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
