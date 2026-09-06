'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AuthCard } from '@/components/auth/AuthCard';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // /app/today n'existe pas encore (roadmap Phase 3 — moteur de cycle) ;
      // c'est la destination cible per PRD §28.2.
      router.push('/app/today');
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Champs invalides.',
          TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives de connexion. Réessaie plus tard.',
          LOCKED_OUT: 'Compte temporairement verrouillé. Réessaie plus tard.',
          INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
          EMAIL_NOT_VERIFIED: 'Merci de vérifier ton email avant de te connecter.',
          ACCOUNT_SUSPENDED: 'Ce compte a été suspendu. Contacte le support.',
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
    <AuthCard title="Content de te revoir" subtitle="Connecte-toi à ton compte NAWIRA.">
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="font-medium text-primary">
          Créer un compte
        </Link>
      </p>
    </AuthCard>
  );
}
