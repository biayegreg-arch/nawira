// Reads `?email=` et `?code=` dans l'URL (le lien envoyé par email pré-remplit
// les deux). Pas de connexion automatique après reset — tokenVersion est
// incrémenté côté serveur pour invalider toute session volée.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

function ResetPasswordForm(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      router.push('/login?reset=ok');
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          TOO_MANY_RESET_ATTEMPTS: 'Trop de tentatives. Réessaie dans 15 minutes.',
          PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
          PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 10 caractères.',
          PASSWORD_PWNED: 'Ce mot de passe a été trouvé dans une fuite de données connue.',
          VERIFICATION_CODE_INVALID: 'Code de réinitialisation invalide.',
          VERIFICATION_CODE_EXPIRED: 'Ce code a expiré. Demande-en un nouveau.',
        };
        setError(map[err.code] ?? 'Une erreur est survenue.');
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Réinitialise ton mot de passe"
      subtitle="Entre le code reçu par email et ton nouveau mot de passe."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Code de réinitialisation"
          type="text"
          name="code"
          required
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          maxLength={8}
          className="font-mono uppercase tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Field
          label="Nouveau mot de passe"
          type="password"
          name="newPassword"
          required
          autoComplete="new-password"
          minLength={10}
          hint="Au moins 10 caractères."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-primary">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
