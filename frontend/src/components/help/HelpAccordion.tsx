'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HelpCategory } from '@/lib/help-content';

export function HelpAccordion({ category }: { category: HelpCategory }): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            category.bgClass,
            category.colorClass,
          )}
        >
          <category.icon size={16} />
        </div>
        <h3 className="text-base font-bold text-navy">{category.title}</h3>
      </div>

      <div className="flex flex-col gap-2">
        {category.questions.map((item, i) => {
          const open = openIndex === i;
          return (
            <div key={item.q} className="rounded-lg border border-border bg-gray-50">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <span className="text-sm font-medium text-navy">{item.q}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'shrink-0 text-muted-light transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </button>
              {open && (
                <p className="border-t border-border px-3 pt-2 pb-3 text-sm text-muted-foreground">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
