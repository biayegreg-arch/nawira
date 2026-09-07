interface CycleRingProps {
  currentDay: number | null;
  estimatedLength: number | null;
}

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A single neutral progress arc ("Jour N sur ~L jours") — deliberately NOT
 * the 4-phase (menstrual/follicular/ovulation/luteal) ring from the Banani
 * source. Phase segments encode fertility-window claims, which are
 * out of scope this phase (PRD §8, deferred to E5).
 */
export function CycleRing({ currentDay, estimatedLength }: CycleRingProps): React.JSX.Element {
  const progress =
    currentDay !== null && estimatedLength ? Math.min(currentDay / estimatedLength, 1) : 0;
  const dash = progress * CIRCUMFERENCE;

  return (
    <div className="relative h-32 w-32 shrink-0 lg:h-40 lg:w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle cx="80" cy="80" r={RADIUS} fill="none" strokeWidth="14" className="stroke-border" />
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
