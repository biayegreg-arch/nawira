import { cn } from '@/lib/utils';

interface ChipOption {
  value: string;
  label: string;
}

interface ChipGroupProps {
  options: ChipOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

/**
 * Single-select vs. multi-select is decided by the caller's `onToggle`
 * handler (replace-or-clear vs. push/remove) — this component only
 * renders the chip row and reports taps.
 */
export function ChipGroup({
  options,
  selectedValues,
  onToggle,
}: ChipGroupProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selectedValues.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            aria-pressed={active}
            className={cn(
              'rounded-full border px-4 py-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-white text-navy hover:bg-gray-50',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
