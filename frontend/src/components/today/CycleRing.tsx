interface CycleRingProps {
  currentDay: number | null;
  estimatedLength: number | null;
  /** 1-indexed day-of-cycle offsets, computed from the user's own real fertile-window prediction — never a fixed generic range (PRD §8.1). */
  fertileStartDay?: number | null;
  fertileEndDay?: number | null;
}

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A single neutral progress arc ("Jour N sur ~L jours"), with an optional
 * green segment overlay marking the user's own computed fertile window —
 * never the Banani source's fixed 4-phase (menstrual/follicular/ovulation/
 * luteal) ring, which hardcodes generic day ranges (days 1-5, 14-16, …)
 * that PRD §8.1 explicitly forbids ("ne jamais généraliser « jour 14 »").
 */
export function CycleRing({
  currentDay,
  estimatedLength,
  fertileStartDay,
  fertileEndDay,
}: CycleRingProps): React.JSX.Element {
  const progress =
    currentDay !== null && estimatedLength ? Math.min(currentDay / estimatedLength, 1) : 0;
  const dash = progress * CIRCUMFERENCE;

  const fertileArc =
    fertileStartDay != null && fertileEndDay != null && estimatedLength
      ? {
          rotation: ((fertileStartDay - 1) / estimatedLength) * 360 - 90,
          length: ((fertileEndDay - fertileStartDay + 1) / estimatedLength) * CIRCUMFERENCE,
        }
      : null;

  return (
    <div className="relative h-32 w-32 shrink-0 lg:h-40 lg:w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle cx="80" cy="80" r={RADIUS} fill="none" strokeWidth="14" className="stroke-border" />
        {fertileArc && (
          <circle
            cx="80"
            cy="80"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            strokeDasharray={`${fertileArc.length} ${CIRCUMFERENCE}`}
            transform={`rotate(${fertileArc.rotation} 80 80)`}
            className="stroke-green"
          />
        )}
        {currentDay !== null && (
          <circle
            cx="80"
            cy="80"
            r={RADIUS}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 80 80)"
            className="stroke-primary"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {currentDay !== null ? (
          <>
            <div className="text-2xl font-bold text-navy lg:text-3xl">Jour {currentDay}</div>
            {estimatedLength !== null && (
              <div className="mt-0.5 text-xs text-muted-foreground">
                sur ~{estimatedLength} jours
              </div>
            )}
          </>
        ) : (
          <div className="px-4 text-xs text-muted-foreground">Commence à suivre ton cycle</div>
        )}
      </div>
    </div>
  );
}
