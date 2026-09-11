'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { searchAll, type SearchResult } from '@/lib/search-index';

const GROUP_ORDER: SearchResult['group'][] = ['Pages', 'Aide', 'Projet Bébé'];

function ResultsList({
  results,
  query,
  onSelect,
}: {
  results: SearchResult[];
  query: string;
  onSelect: (href: string) => void;
}): React.JSX.Element {
  if (query.trim() === '') {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        Cherche une page, un article ou une question fréquente…
      </p>
    );
  }
  if (results.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        Aucun résultat pour « {query} ».
      </p>
    );
  }
  return (
    <div className="max-h-96 overflow-y-auto py-2">
      {GROUP_ORDER.map((group) => {
        const items = results.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-light uppercase">
              {group}
            </div>
            {items.map((item) => (
              <button
                key={`${item.group}-${item.href}-${item.title}`}
                type="button"
                onClick={() => onSelect(item.href)}
                className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-navy">{item.title}</span>
                {item.subtitle && (
                  <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function GlobalSearch({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchAll(query), [query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function select(href: string): void {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && results.length > 0) select(results[0]!.href);
  }

  function openAndFocus(): void {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (compact) {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={openAndFocus}
          aria-label="Rechercher"
          className="p-2 text-navy"
        >
          <Search size={20} />
        </button>
        {open && (
          <div className="animate-scale-in fixed inset-x-3 top-16 z-30 rounded-xl border border-border bg-white shadow-lg">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search size={16} className="text-muted-light" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher une information, un article…"
                className="w-full text-sm text-navy outline-none placeholder:text-muted-light"
              />
            </div>
            <ResultsList results={results} query={query} onSelect={select} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative max-w-xl flex-1">
      <div
        className="flex items-center gap-3 rounded-full border border-border bg-gray-50 px-4 py-2.5"
        onClick={openAndFocus}
      >
        <Search size={16} className="text-muted-light" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Rechercher une information, un article…"
          className="w-full bg-transparent text-sm text-navy outline-none placeholder:text-muted-light"
        />
      </div>
      {open && (
        <div className="animate-scale-in absolute top-full left-0 z-30 mt-2 w-full rounded-xl border border-border bg-white shadow-lg">
          <ResultsList results={results} query={query} onSelect={select} />
        </div>
      )}
    </div>
  );
}
