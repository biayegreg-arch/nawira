'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdmin } from '@/contexts/AdminContext';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt: string;
  updatedAt: string;
}

interface ArticleListResponse {
  items: ArticleRow[];
  nextCursor: string | null;
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'SLUG_TAKEN':
      return 'Ce slug est déjà utilisé.';
    case 'VALIDATION_FAILED':
      return 'Titre ou contenu invalide.';
    default:
      return err.message;
  }
}

export default function AdminArticlesPage(): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const canWrite = admin.can.includes('content:write');

  const [articles, setArticles] = useState<ArticleRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ArticleListResponse>('/api/admin/articles?limit=50');
      setArticles(res.items);
      setCursor(res.nextCursor);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<ArticleListResponse>(
        `/api/admin/articles?limit=50&cursor=${encodeURIComponent(cursor)}`,
      );
      setArticles((prev) => [...(prev ?? []), ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function createArticle(): Promise<void> {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api('/api/admin/articles', { method: 'POST', body: { title, body } });
      setTitle('');
      setBody('');
      setCreating(false);
      await load();
      toast('Article créé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(a: ArticleRow): Promise<void> {
    const status = a.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT';
    try {
      await api(`/api/admin/articles/${a.id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function remove(a: ArticleRow): Promise<void> {
    try {
      await api(`/api/admin/articles/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Articles</h1>
        {canWrite && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            {creating ? 'Annuler' : 'Nouvel article'}
          </button>
        )}
      </div>

      {creating && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre"
            className="rounded-lg border border-border p-3 text-sm text-navy outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Contenu"
            className="rounded-lg border border-border p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void createArticle()}
            disabled={saving || !title.trim() || !body.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Création…' : 'Créer (brouillon)'}
          </button>
        </div>
      )}

      {articles === null ? (
        <AdminListSkeleton />
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun article.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {articles.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy">{a.title}</div>
                <div className="text-xs text-muted-foreground">/{a.slug}</div>
              </div>
              <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                {a.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
              </Badge>
              {canWrite && (
                <div className="flex gap-2">
                  <button
                    onClick={() => void togglePublish(a)}
                    className="text-xs font-medium text-primary underline"
                  >
                    {a.status === 'DRAFT' ? 'Publier' : 'Dépublier'}
                  </button>
                  <button
                    onClick={() => void remove(a)}
                    className="text-xs font-medium text-danger underline"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {articles !== null && cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="self-center rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy disabled:opacity-50"
        >
          {loadingMore ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}
