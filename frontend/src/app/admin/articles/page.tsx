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

interface ArticleDetailResponse {
  article: ArticleRow & { body: string };
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
      return 'Titre, slug ou contenu invalide.';
    case 'ARTICLE_NOT_FOUND':
      return 'Article introuvable.';
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
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ArticleListResponse>('/api/admin/articles?limit=50');
      setArticles(res.items);
      setCursor(res.nextCursor);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
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

  async function startEdit(a: ArticleRow): Promise<void> {
    if (loadingEditId) return;
    setLoadingEditId(a.id);
    try {
      const res = await api<ArticleDetailResponse>(`/api/admin/articles/${a.id}`);
      setEditTitle(res.article.title);
      setEditSlug(res.article.slug);
      setEditBody(res.article.body);
      setEditingId(a.id);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoadingEditId(null);
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editingId || !editTitle.trim() || !editSlug.trim() || !editBody.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api<ArticleDetailResponse>(`/api/admin/articles/${editingId}`, {
        method: 'PATCH',
        body: { title: editTitle, slug: editSlug, body: editBody },
      });
      const { title: t, slug, status, updatedAt } = res.article;
      setArticles((prev) =>
        prev === null
          ? prev
          : prev.map((x) => (x.id === editingId ? { ...x, title: t, slug, status, updatedAt } : x)),
      );
      setEditingId(null);
      toast('Article modifié.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingEdit(false);
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
    if (!window.confirm('Supprimer définitivement cet article ?')) return;
    try {
      await api(`/api/admin/articles/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  if (error && articles === null) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 md:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold leading-tight text-navy md:text-3xl">Articles</h1>
        {canWrite && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white sm:w-auto"
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
            className="min-h-11 w-full rounded-lg border border-border p-3 text-base text-navy outline-none focus:border-primary md:text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Contenu"
            className="min-h-11 w-full rounded-lg border border-border p-3 text-base text-navy outline-none focus:border-primary md:text-sm"
          />
          <button
            onClick={() => void createArticle()}
            disabled={saving || !title.trim() || !body.trim()}
            className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:self-end"
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
          {articles.map((a) =>
            editingId === a.id ? (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4"
              >
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Titre"
                  className="min-h-11 w-full rounded-lg border border-border p-3 text-base text-navy outline-none focus:border-primary md:text-sm"
                />
                <input
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="slug-de-l-article"
                  autoCapitalize="none"
                  className="min-h-11 w-full rounded-lg border border-border p-3 text-base text-navy outline-none focus:border-primary md:text-sm"
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={8}
                  placeholder="Contenu"
                  className="min-h-11 w-full rounded-lg border border-border p-3 text-base text-navy outline-none focus:border-primary md:text-sm"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={savingEdit}
                    className="min-h-11 w-full rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-navy disabled:opacity-50 sm:w-auto"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => void saveEdit()}
                    disabled={
                      savingEdit || !editTitle.trim() || !editSlug.trim() || !editBody.trim()
                    }
                    className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                  >
                    {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3 sm:flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-navy">{a.title}</div>
                    <div className="break-all text-xs text-muted-foreground">/{a.slug}</div>
                  </div>
                  <Badge
                    tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}
                    className="shrink-0"
                  >
                    {a.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
                  </Badge>
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => void startEdit(a)}
                      disabled={loadingEditId !== null}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-medium text-primary underline disabled:opacity-50"
                    >
                      {loadingEditId === a.id ? 'Chargement…' : 'Modifier'}
                    </button>
                    <button
                      onClick={() => void togglePublish(a)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-medium text-primary underline"
                    >
                      {a.status === 'DRAFT' ? 'Publier' : 'Dépublier'}
                    </button>
                    <button
                      onClick={() => void remove(a)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-medium text-danger underline"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {articles !== null && cursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="min-h-11 w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-navy disabled:opacity-50 sm:w-auto sm:self-center"
        >
          {loadingMore ? 'Chargement…' : 'Charger plus'}
        </button>
      )}
    </div>
  );
}
