'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export function ContactSupportCard(): React.JSX.Element {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ ticket: { id: string } }>('/api/support-tickets', {
        method: 'POST',
        body: { subject, message },
      });
      router.push(`/app/support/${res.ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold md:text-lg text-navy">
        <Mail size={18} className="shrink-0 text-primary" />
        Contacte notre équipe
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Tu n&rsquo;as pas trouvé la réponse ? Décris ton problème, on te répond ici.
      </p>
      <div className="flex flex-col gap-3">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet"
          className="min-h-11 w-full rounded-lg border border-border bg-gray-50 p-3 text-base text-navy outline-none md:text-sm"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Décris ton problème…"
          className="min-h-11 w-full rounded-lg border border-border bg-gray-50 p-3 text-base text-navy outline-none md:text-sm"
        />
        {error && <p className="break-words text-sm text-danger">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={sending || !subject.trim() || !message.trim()}
          className="min-h-12 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:self-end"
        >
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
        <Link
          href="/app/support"
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary"
        >
          Mes demandes
        </Link>
      </div>
    </div>
  );
}
