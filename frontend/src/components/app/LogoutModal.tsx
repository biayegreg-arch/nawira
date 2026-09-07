'use client';

import { ShieldCheck, Clock, Smartphone, X } from 'lucide-react';

interface LogoutModalProps {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutModal({
  open,
  loading,
  onCancel,
  onConfirm,
}: LogoutModalProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border bg-background p-6">
          <h2 id="logout-modal-title" className="text-lg font-bold text-navy">
            Déconnexion
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="text-center">
            <h3 className="text-sm font-semibold text-navy">Tu es sûre ?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu vas être déconnectée de NAWIRA. Tu pourras te reconnecter à tout moment avec tes
              identifiants.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
              <ShieldCheck size={14} className="shrink-0 text-green" />
              <span className="text-xs text-muted-foreground">
                Tes données restent sécurisées et chiffrées.
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
              <Clock size={14} className="shrink-0 text-amber" />
              <span className="text-xs text-muted-foreground">
                Tu seras reconnectée automatiquement si ta session est encore valide.
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
              <Smartphone size={14} className="shrink-0 text-rose" />
              <span className="text-xs text-muted-foreground">
                Tu resteras connectée sur tes autres appareils.
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-border p-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-border bg-gray-50 px-4 py-2.5 text-sm font-semibold text-navy"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-md bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Déconnexion…' : 'Déconnexion'}
          </button>
        </div>
      </div>
    </div>
  );
}
