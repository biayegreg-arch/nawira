'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAdmin } from '@/contexts/AdminContext';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface TicketDetail {
  ticket: {
    id: string;
    subject: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    createdAt: string;
    userEmailMasked: string;
  };
  messages: { id: string; role: 'USER' | 'ADMIN'; body: string; createdAt: string }[];
}

const STATUS_LABEL: Record<TicketDetail['ticket']['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export default function AdminSupportTicketPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const { toast } = useToast();
  const canReply = admin.can.includes('support-tickets:reply');

  const [data, setData] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [revealedEmail, setRevealedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<TicketDetail>(`/api/admin/support-tickets/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reveal(): Promise<void> {
    try {
      const res = await api<{ email: string }>(`/api/admin/support-tickets/${id}/reveal`, {
        method: 'POST',
      });
      setRevealedEmail(res.email);
    } catch {
      toast('Impossible de révéler l’email.', 'error');
    }
  }

  async function sendReply(): Promise<void> {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api(`/api/admin/support-tickets/${id}/messages`, {
        method: 'POST',
        body: { message: reply },
      });
      setReply('');
      await load();
      toast('Réponse envoyée.', 'success');
    } catch {
      toast('Échec de l’envoi.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: TicketDetail['ticket']['status']): Promise<void> {
    try {
      await api(`/api/admin/support-tickets/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
      toast('Statut mis à jour.', 'success');
    } catch {
      toast('Échec de la mise à jour du statut.', 'error');
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">{data.ticket.subject}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{revealedEmail ?? data.ticket.userEmailMasked}</span>
            {!revealedEmail && (
              <button onClick={() => void reveal()} className="text-primary underline">
                Révéler
              </button>
            )}
          </div>
        </div>
        <select
          value={data.ticket.status}
          onChange={(e) => void changeStatus(e.target.value as TicketDetail['ticket']['status'])}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
        >
          {(Object.keys(STATUS_LABEL) as TicketDetail['ticket']['status'][]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border border-border p-3 text-sm ${m.role === 'ADMIN' ? 'bg-primary-soft' : 'bg-card'}`}
          >
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              <Badge tone={m.role === 'ADMIN' ? 'primary' : 'neutral'}>
                {m.role === 'ADMIN' ? 'Équipe' : 'Utilisatrice'}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap text-navy">{m.body}</p>
          </div>
        ))}
      </div>

      {canReply && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Écrire une réponse…"
            className="rounded-lg border border-border bg-white p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void sendReply()}
            disabled={sending || !reply.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Répondre'}
          </button>
        </div>
      )}
    </div>
  );
}
