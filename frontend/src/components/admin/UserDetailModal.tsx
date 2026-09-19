'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import type { AdminUser } from './types';

interface UserDetailModalProps {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (user: AdminUser) => void;
}

const ROLE_TONE: Record<AdminUser['role'], 'neutral' | 'primary' | 'warning'> = {
  USER: 'neutral',
  ADMIN: 'primary',
  SUPERADMIN: 'warning',
};

const STATUS_TONE: Record<AdminUser['status'], 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DELETED: 'danger',
};

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'LAST_SUPERADMIN':
      return 'Impossible de rétrograder ou supprimer le dernier SUPERADMIN.';
    case 'RESTORE_REQUIRES_SUPERADMIN':
      return 'Seul un SUPERADMIN peut réactiver ce compte.';
    case 'SUSPEND_REQUIRES_SUPERADMIN':
      return 'Seul un SUPERADMIN peut suspendre un compte SUPERADMIN.';
    case 'USER_NOT_FOUND':
      return 'Cette utilisatrice n’existe plus.';
    case 'PROFILE_NOT_FOUND':
      return 'Cette utilisatrice n’a pas terminé son onboarding — impossible de lui attribuer un plan.';
    case 'ALREADY_DELETED':
      return 'Ce compte est déjà supprimé.';
    case 'DELETION_BLOCKED_PENDING_WITHDRAWAL':
      return 'Un retrait est en cours de traitement ; réessaie une fois terminé.';
    case 'VALIDATION_FAILED':
      return 'Date d’expiration invalide, ou fournie avec le plan Free.';
    default:
      return err.message;
  }
}

export function UserDetailModal({
  user,
  onClose,
  onUpdated,
}: UserDetailModalProps): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [planDraft, setPlanDraft] = useState<AdminUser['plan']>(user.plan);
  const [expiresAtDraft, setExpiresAtDraft] = useState(
    user.planExpiresAt ? user.planExpiresAt.slice(0, 10) : '',
  );

  const canChangeRole = admin.can.includes('users:role');
  const canSuspend = admin.can.includes('users:status:suspend');
  const canRestore = admin.can.includes('users:status:restore');
  const canDelete = admin.can.includes('users:delete');
  const canManagePlan = admin.can.includes('users:plan');

  async function changeRole(role: AdminUser['role']): Promise<void> {
    setBusy(true);
    try {
      const res = await api<{ user: { id: string; role: AdminUser['role'] } }>(
        `/api/admin/users/${user.id}/role`,
        { method: 'PATCH', body: { role } },
      );
      onUpdated({ ...user, role: res.user.role });
      toast('Rôle mis à jour.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(): Promise<void> {
    setBusy(true);
    try {
      const body: { plan: AdminUser['plan']; expiresAt?: string } = { plan: planDraft };
      if (planDraft !== 'FREE' && expiresAtDraft) {
        body.expiresAt = new Date(`${expiresAtDraft}T00:00:00.000Z`).toISOString();
      }
      const res = await api<{ profile: { plan: AdminUser['plan']; planExpiresAt: string | null } }>(
        `/api/admin/users/${user.id}/plan`,
        { method: 'PATCH', body },
      );
      onUpdated({ ...user, plan: res.profile.plan, planExpiresAt: res.profile.planExpiresAt });
      toast('Plan mis à jour.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(): Promise<void> {
    setBusy(true);
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        body: { confirmation: 'DELETE' },
      });
      onUpdated({ ...user, status: 'DELETED' });
      toast('Compte supprimé définitivement.', 'success');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  }

  async function changeStatus(status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
    setBusy(true);
    try {
      const res = await api<{ user: { id: string; status: AdminUser['status'] } }>(
        `/api/admin/users/${user.id}/status`,
        { method: 'PATCH', body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) } },
      );
      onUpdated({ ...user, status: res.user.status });
      setReason('');
      toast(status === 'SUSPENDED' ? 'Compte suspendu.' : 'Compte réactivé.', 'success');
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
        aria-labelledby="user-detail-title"
      >
        <div className="flex items-center justify-between border-b border-border bg-background p-5">
          <h2 id="user-detail-title" className="text-base font-bold text-navy">
            Détail du compte
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
          <div className="flex items-center gap-3">
            <InitialsAvatar name={user.name} email={user.email} />
            <div className="min-w-0">
              <div className="truncate font-semibold text-navy">{user.name ?? user.email}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ROLE_TONE[user.role]}>{user.role}</Badge>
            <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
            {!user.emailVerifiedAt && <Badge tone="warning">Email non vérifié</Badge>}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Inscrit·e le</dt>
              <dd className="font-medium text-navy">
                {new Date(user.createdAt).toLocaleDateString('fr-FR')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email vérifié</dt>
              <dd className="font-medium text-navy">
                {user.emailVerifiedAt
                  ? new Date(user.emailVerifiedAt).toLocaleDateString('fr-FR')
                  : '—'}
              </dd>
            </div>
          </dl>

          {canChangeRole && user.status !== 'DELETED' && (
            <div>
              <label className="text-xs font-medium text-navy" htmlFor="role-select">
                Rôle
              </label>
              <select
                id="role-select"
                value={user.role}
                disabled={busy}
                onChange={(e) => void changeRole(e.target.value as AdminUser['role'])}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERADMIN">SUPERADMIN</option>
              </select>
            </div>
          )}

          {canManagePlan && user.status !== 'DELETED' && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <label className="text-xs font-medium text-navy" htmlFor="plan-select">
                Plan
              </label>
              <select
                id="plan-select"
                value={planDraft}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as AdminUser['plan'];
                  setPlanDraft(next);
                  if (next === 'FREE') setExpiresAtDraft('');
                }}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="FREE">FREE</option>
                <option value="PLUS">PLUS</option>
                <option value="BABY">BABY</option>
              </select>
              {planDraft !== 'FREE' && (
                <>
                  <label className="text-xs font-medium text-navy" htmlFor="plan-expires">
                    Expire le (optionnel — laisser vide pour permanent)
                  </label>
                  <input
                    id="plan-expires"
                    type="date"
                    value={expiresAtDraft}
                    disabled={busy}
                    onChange={(e) => setExpiresAtDraft(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePlan()}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          )}

          {user.status !== 'DELETED' && (canSuspend || canRestore) && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {user.status === 'ACTIVE' && canSuspend && (
                <>
                  <label className="text-xs font-medium text-navy" htmlFor="suspend-reason">
                    Motif (optionnel)
                  </label>
                  <input
                    id="suspend-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Raison de la suspension"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus('SUSPENDED')}
                    className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Suspendre le compte
                  </button>
                </>
              )}
              {user.status === 'SUSPENDED' && canRestore && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus('ACTIVE')}
                  className="rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Réactiver le compte
                </button>
              )}
            </div>
          )}

          {canDelete && user.status !== 'DELETED' && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <div className="text-xs font-semibold text-danger">Zone dangereuse</div>
              {!confirmingDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded-lg border border-danger px-4 py-2.5 text-sm font-semibold text-danger disabled:opacity-50"
                >
                  Supprimer définitivement ce compte
                </button>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Cette action est irréversible : les données de santé et comportementales seront
                    effacées ; les données financières (commandes, retraits) seront anonymisées,
                    jamais supprimées.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(false)}
                      className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-navy disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteUser()}
                      className="flex-1 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Confirmer la suppression
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
