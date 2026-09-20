'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

interface TicketThread {
  ticket: {
    id: string;
    subject: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    createdAt: string;
  };
  messages: {
    id: string;
    role: 'USER' | 'ADMIN';
    body: string;
    createdAt: string;
    authorEmail: string;
  }[];
}

const STATUS_LABEL: Record<TicketThread['ticket']['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  if (err.code === 'TICKET_CLOSED') return 'Cette demande est fermée.';
  return err.message;
}

export default function SupportTicketThreadPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TicketThread | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<TicketThread>(`/api/support-tickets/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closed = data?.ticket.status === 'RESOLVED' || data?.ticket.status === 'CLOSED';

  async function sendReply(): Promise<void> {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/support-tickets/${id}/messages`, {
        method: 'POST',
        body: { message: reply },
      });
      setReply('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!data) return <div className="p-4 lg:p-8 text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">{data.ticket.subject}</h1>
        <Badge tone={closed ? 'neutral' : 'primary'}>{STATUS_LABEL[data.ticket.status]}</Badge>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border border-border p-3 text-sm ${m.role === 'ADMIN' ? 'bg-primary-soft' : 'bg-white'}`}
          >
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {m.role === 'ADMIN' ? 'Équipe NAWIRA' : 'Toi'}
            </div>
            <p className="whitespace-pre-wrap text-navy">{m.body}</p>
          </div>
        ))}
      </div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      {closed ? (
        <p className="text-sm text-muted-foreground">Cette demande est fermée.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Ta réponse…"
            className="rounded-lg border border-border bg-white p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void sendReply()}
            disabled={sending || !reply.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}
