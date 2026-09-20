'use client';

import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export interface AppliedCoupon {
  code: string;
  percentOff: number;
  /** Discounted integer FCFA per plan, computed server-side. */
  discounted: Partial<Record<'PLUS' | 'BABY', number>>;
}

interface ValidateResponse {
  code: string;
  percentOff: number;
  plan: 'PLUS' | 'BABY';
  discountedFcfa: number;
}

interface CouponBoxProps {
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
}

export function CouponBox({ applied, onApply }: CouponBoxProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // The price is computed server-side per plan; the client never does the maths.
      const [plus, baby] = await Promise.all(
        (['PLUS', 'BABY'] as const).map((plan) =>
          api<ValidateResponse>('/api/coupons/validate', { method: 'POST', body: { code, plan } }),
        ),
      );
      if (!plus || !baby) throw new Error('unreachable');
      onApply({
        code: plus.code,
        percentOff: plus.percentOff,
        discounted: { PLUS: plus.discountedFcfa, BABY: baby.discountedFcfa },
      });
      setCode('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'COUPON_INVALID'
          ? 'Ce code est invalide ou expiré.'
          : 'Impossible de vérifier le code. Réessaie.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green bg-green-soft px-4 py-3 text-sm">
        <Tag size={16} className="shrink-0 text-green" />
        <span className="text-navy">
          Coupon <span className="font-mono font-semibold">{applied.code}</span> appliqué : −
          {applied.percentOff}% sur les plans payants.
        </span>
        <button
          type="button"
          onClick={() => onApply(null)}
          aria-label="Retirer le coupon"
          className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:text-navy"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-md">
      <label htmlFor="coupon-code" className="mb-1.5 block text-sm font-semibold text-navy">
        Tu as un code promo ?
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="Ton code"
          maxLength={64}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-border bg-white px-3 py-2.5 text-sm uppercase text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '…' : 'Appliquer'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
