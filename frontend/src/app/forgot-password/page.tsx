'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          TOO_MANY_FORGOT_ATTEMPTS: 'Trop de demandes. Réessaie plus tard.',
        };
        setError(map[err.code] ?? 'Une erreur est survenue.');
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthCard title="Vérifie tes emails" subtitle="Un code de réinitialisation est en route.">
        <p className="text-sm text-muted-foreground">
          Si un compte existe pour <strong className="text-navy">{email}</strong>, tu vas recevoir
          un code de réinitialisation dans la minute qui suit.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Tu as déjà ton code ?{' '}
          <Link href="/reset-password" className="font-medium text-primary">
            Réinitialiser mon mot de passe
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié ?"
      subtitle="Indique ton email, on t'envoie un code pour le réinitialiser."
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
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Envoi…' : 'Envoyer le code'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Tu te souviens de ton mot de passe ?{' '}
        <Link href="/login" className="font-medium text-primary">
          Se connecter
        </Link>
      </p>
    </AuthCard>
  );
}
