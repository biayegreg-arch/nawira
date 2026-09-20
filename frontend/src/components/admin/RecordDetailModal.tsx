'use client';

import { X } from 'lucide-react';

interface Field {
  label: string;
  value: React.ReactNode;
}

interface RecordDetailModalProps {
  title: string;
  fields: Field[];
  /** Optional raw JSON blob (metadata, payload…) rendered as a formatted block. */
  raw?: { label: string; value: unknown } | undefined;
  onClose: () => void;
  children?: React.ReactNode;
}

export function RecordDetailModal({
  title,
  fields,
  raw,
  onClose,
  children,
}: RecordDetailModalProps): React.JSX.Element {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-scale-in flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-background p-4 sm:p-5">
          <h2
            id="record-detail-title"
            className="min-w-0 break-words text-base font-bold text-navy"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gray-50 text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="break-words font-medium text-navy" title={String(f.value ?? '')}>
                  {f.value ?? '—'}
                </dd>
              </div>
            ))}
          </dl>

          {raw && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-navy">{raw.label}</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-body">
                {JSON.stringify(raw.value, null, 2)}
              </pre>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
