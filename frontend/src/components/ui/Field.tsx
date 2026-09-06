import { type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, className, ...props }: FieldProps): React.JSX.Element {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-navy">{label}</span>
      <input
        id={inputId}
        className={cn(
          // py-3 (not py-2.5) so the rendered height clears the 44px
          // minimum touch target (WCAG 2.5.5 / Apple HIG) at text-sm —
          // measured 42px before this change.
          'rounded-lg border border-border px-3.5 py-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          className,
        )}
        {...props}
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
