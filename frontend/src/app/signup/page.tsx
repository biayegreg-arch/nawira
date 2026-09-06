// Flow: signup → "vérifie ton email" → /verify-email (code à 8 caractères) →
// cookies posés + redirection app. Le endpoint signup résiste à l'énumération :
// même réponse 201 que l'email existe déjà ou non — donc on redirige toujours
// vers /verify-email.
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function SignupPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/signup', {
        method: 'POST',
        body: { email, password },
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          PASSWORD_BANNED: 'Ce mot de passe est trop courant.',
          PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 10 caractères.',
          PASSWORD_PWNED: 'Ce mot de passe a fuité — choisis-en un autre.',
          TOO_MANY_SIGNUP_ATTEMPTS: "Trop de tentatives d'inscription. Réessaie plus tard.",
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
    <AuthCard title="Créer ton compte" subtitle="Gratuit, sans carte bancaire.">
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
          label="Mot de passe"
          type="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={10}
          hint="Au moins 10 caractères."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Création…' : 'Créer mon compte'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/login" className="font-medium text-primary">
          Se connecter
        </Link>
      </p>
    </AuthCard>
  );
}
