'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils';

export interface AdminWithdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  destination: { method?: string; phone?: string; accountName?: string } | null;
  provider: string;
  providerPayoutId: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
}

export const WITHDRAWAL_STATUS_TONE: Record<
  AdminWithdrawal['status'],
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  PENDING: 'warning',
  PROCESSING: 'primary',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

const CANCELLABLE = new Set(['PENDING', 'PROCESSING']);

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR') : '—';
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'WITHDRAWAL_NOT_FOUND':
      return 'Ce retrait n’existe plus.';
    case 'WITHDRAWAL_NOT_CANCELLABLE':
      return 'Ce retrait n’est plus annulable.';
    default:
      return err.message;
  }
}

interface WithdrawalDetailModalProps {
  withdrawal: AdminWithdrawal;
  onClose: () => void;
  onUpdated: (w: AdminWithdrawal) => void;
}

export function WithdrawalDetailModal({
  withdrawal,
  onClose,
  onUpdated,
}: WithdrawalDetailModalProps): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const canCancel = admin.can.includes('withdrawals:cancel');

  async function cancelWithdrawal(): Promise<void> {
    if (!reason.trim()) {
      toast('Indique un motif d’annulation.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ withdrawal: AdminWithdrawal }>(
        `/api/admin/withdrawals/${withdrawal.id}/cancel`,
        { method: 'POST', body: { reason: reason.trim() } },
      );
      onUpdated({ ...withdrawal, ...res.withdrawal });
      toast('Retrait annulé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-scale-in w-full max-w-md overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawal-detail-title"
      >
        <div className="flex items-center justify-between border-b border-border bg-background p-5">
          <h2 id="withdrawal-detail-title" className="text-base font-bold text-navy">
            Détail du retrait
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={WITHDRAWAL_STATUS_TONE[withdrawal.status]}>{withdrawal.status}</Badge>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Montant</dt>
              <dd className="font-medium text-navy">
                {formatPrice(withdrawal.amount, withdrawal.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fournisseur</dt>
              <dd className="font-medium text-navy">{withdrawal.provider}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Méthode</dt>
              <dd className="font-medium text-navy">{withdrawal.destination?.method ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd className="font-medium text-navy">{withdrawal.destination?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Demandé le</dt>
              <dd className="font-medium text-navy">{fmtDate(withdrawal.requestedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Traité le</dt>
              <dd className="font-medium text-navy">{fmtDate(withdrawal.processedAt)}</dd>
            </div>
            {withdrawal.failureReason && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">Motif d’échec / annulation</dt>
                <dd className="font-medium text-navy">{withdrawal.failureReason}</dd>
              </div>
            )}
          </dl>

          {canCancel && CANCELLABLE.has(withdrawal.status) && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <label className="text-xs font-medium text-navy" htmlFor="cancel-reason">
                Motif d’annulation
              </label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Raison de l’annulation"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelWithdrawal()}
                className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Annuler le retrait
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
