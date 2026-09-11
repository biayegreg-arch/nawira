'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bell, BellDot, BellOff, Lock, Link2 } from 'lucide-react';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { staggerDelay } from '@/lib/utils';

type NotificationLevel = 'NORMAL' | 'DISCREET' | 'NONE';

const NOTIFICATION_OPTIONS: Array<{
  value: NotificationLevel;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'NORMAL',
    title: 'Normales',
    description: 'Rappels et alertes complètes.',
    icon: <Bell className="h-5 w-5 text-primary" />,
  },
  {
    value: 'DISCREET',
    title: 'Discrètes',
    description: 'Notifications sans détails visibles.',
    icon: <BellDot className="h-5 w-5 text-primary" />,
  },
  {
    value: 'NONE',
    title: 'Aucune',
    description: 'Pas de notifications.',
    icon: <BellOff className="h-5 w-5 text-primary" />,
  },
];

const PASSWORD_ERROR_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Mot de passe actuel incorrect.',
  PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
  PASSWORD_TOO_SHORT: 'Mot de passe trop court.',
  PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
  PASSWORD_ALREADY_SET: 'Un mot de passe est déjà défini. Utilise « changer le mot de passe ».',
  VALIDATION_FAILED: 'Champs invalides.',
};

export default function AppSettingsPage(): React.JSX.Element | null {
  const user = useUser();
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel | null>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api<{ profile: { notificationLevel: NotificationLevel } }>('/api/profile');
      setNotificationLevel(res.profile.notificationLevel);
    } catch {
      // Non-fatal — the picker just starts unselected; the user can still choose and save.
      toast('Impossible de charger tes préférences actuelles.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void loadProfile();
  }, [user, loadProfile]);

  if (!user) return null;

  const hasPassword = user.hasPassword;
  const googleLinked = user.linkedProviders.includes('google');

  async function onSubmitPassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length === 0) {
      setPasswordError('Saisis un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmittingPassword(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', { method: 'POST', body: { newPassword } });
        toast('Mot de passe défini.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(PASSWORD_ERROR_MAP[err.code] ?? err.message);
      } else {
        setPasswordError('Erreur réseau. Réessaie.');
      }
    } finally {
      setSubmittingPassword(false);
    }
  }

  async function onSelectNotificationLevel(level: NotificationLevel): Promise<void> {
    setNotificationLevel(level);
    setSavingNotifications(true);
    try {
      await api('/api/profile', { method: 'PATCH', body: { notificationLevel: level } });
      toast('Préférences enregistrées.', 'success');
    } catch {
      toast('Impossible d’enregistrer. Réessaie.', 'error');
    } finally {
      setSavingNotifications(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy">
          <span className="text-3xl">⚙️</span>
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Gère ta sécurité et tes préférences.</p>
      </div>

      <div className="flex flex-col gap-6">
        <section
          className="animate-fade-in-up rounded-xl border border-border bg-white p-6"
          style={staggerDelay(0)}
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
            <Lock size={18} className="text-primary" />
            {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {hasPassword
              ? 'Tu peux modifier ton mot de passe ici. Les autres sessions seront déconnectées.'
              : 'Tu t’es connectée via Google. Définis un mot de passe pour pouvoir aussi te connecter par email.'}
          </p>
          <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
            {hasPassword && (
              <label className="flex flex-col gap-1 text-sm text-navy">
                Mot de passe actuel
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded-md border border-border px-3 py-2.5"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm text-navy">
              Nouveau mot de passe
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-border px-3 py-2.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-navy">
              Confirmer le nouveau mot de passe
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-md border border-border px-3 py-2.5"
              />
            </label>
            {passwordError && (
              <p role="alert" className="text-sm text-danger">
                {passwordError}
              </p>
            )}
            <button
              type="submit"
              disabled={submittingPassword}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
            >
              {submittingPassword
                ? 'Enregistrement…'
                : hasPassword
                  ? 'Changer le mot de passe'
                  : 'Définir le mot de passe'}
            </button>
          </form>
        </section>

        <section
          className="animate-fade-in-up rounded-xl border border-border bg-white p-6"
          style={staggerDelay(1)}
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
            <Link2 size={18} className="text-green" />
            Comptes liés
          </h2>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-gray-50 p-3">
            <div>
              <div className="text-sm font-medium text-navy">Google</div>
              <div className="text-xs text-muted-foreground">
                {googleLinked
                  ? 'Tu peux te connecter via Google.'
                  : 'Lie ton compte Google pour te connecter en un clic.'}
              </div>
            </div>
            {googleLinked ? (
              <span className="animate-scale-in rounded-full bg-green-soft px-3 py-1 text-xs font-medium text-green">
                Lié
              </span>
            ) : (
              <a
                href="/api/auth/oauth/google/start?next=/app/settings"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-navy transition-all duration-150 hover:bg-gray-50 active:scale-95"
              >
                Lier Google
              </a>
            )}
          </div>
        </section>

        <section
          className="animate-fade-in-up rounded-xl border border-border bg-white p-6"
          style={staggerDelay(2)}
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
            <Bell size={18} className="text-amber" />
            Notifications
          </h2>
          <div className="flex flex-col gap-3">
            {NOTIFICATION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                selected={notificationLevel === opt.value}
                onClick={() => void onSelectNotificationLevel(opt.value)}
                icon={opt.icon}
                title={opt.title}
                description={opt.description}
              />
            ))}
          </div>
          {savingNotifications && (
            <p className="mt-2 text-xs text-muted-foreground">Enregistrement…</p>
          )}
        </section>
      </div>
    </div>
  );
}
