// Lit `?email=` et `?code=` dans l'URL (le lien envoyé par email pré-remplit
// les deux). Si les deux sont présents, on soumet automatiquement ; sinon
// c'est un formulaire de secours pour saisie manuelle du code à 8 caractères.
'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

function VerifyEmailForm(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) {
      void verify(qEmail, qCode);
    }
  }, []);

  async function verify(emailValue: string, codeValue: string): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string; user?: { hasProfile: boolean } }>(
        '/api/auth/verify-email',
        {
          method: 'POST',
          body: { email: emailValue, code: codeValue },
        },
      );
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // Un compte tout juste vérifié n'a jamais de Profile — mais on relit
      // hasProfile depuis la réponse plutôt que de supposer false, au cas où
      // un flux futur créerait un Profile avant vérification.
      router.push(res.user?.hasProfile ? '/app/today' : '/onboarding/welcome');
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives. Réessaie plus tard.',
          VERIFICATION_CODE_INVALID: 'Code de vérification invalide.',
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

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    void verify(email, code);
  }

  async function onResend(): Promise<void> {
    if (!email) {
      setError('Entre ton email pour recevoir un nouveau code.');
      return;
    }
    setResending(true);
    setError(null);
    setResent(false);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      setResent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          TOO_MANY_RESEND_ATTEMPTS: 'Trop de demandes. Réessaie plus tard.',
          RATE_LIMIT_UNAVAILABLE: 'Service indisponible. Réessaie dans un instant.',
        };
        setError(map[err.code] ?? 'Une erreur est survenue.');
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard
      title="Vérifie ton email"
      subtitle="Nous t'avons envoyé un code à 8 caractères. Il expire dans 10 minutes."
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
          label="Code de vérification"
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
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {resent && (
          <p className="text-sm text-green">
            Un nouveau code a été envoyé si ce compte existe et n&rsquo;est pas déjà vérifié.
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Vérification…' : 'Vérifier mon email'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Pas reçu de code ?{' '}
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={resending}
          className="inline-flex min-h-11 items-center font-medium text-primary disabled:opacity-50"
        >
          {resending ? 'Envoi…' : 'Renvoyer le code'}
        </button>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Email incorrect ?{' '}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-medium text-primary">
          Recommencer l&rsquo;inscription
        </Link>
      </p>
    </AuthCard>
  );
}

export default function VerifyEmailPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
