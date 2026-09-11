'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;

// ease-out cubic — fast start, gentle settle (UX guideline: ease-out on entry).
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface AnimatedNumberProps {
  value: number;
  /** Wraps the rendered number, e.g. "≈{n} jours" -> prefix/suffix. */
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts up from the previous value to `value` over ~600ms. Skips the
 * animation entirely under prefers-reduced-motion or on first mount (no
 * "counting up from 0" flash on initial page load — only re-renders that
 * change the value animate).
 */
export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  className,
}: AnimatedNumberProps): React.JSX.Element {
  const [displayed, setDisplayed] = useState(value);
  const prevValue = useRef(value);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;
    if (from === to) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setDisplayed(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      const eased = easeOutCubic(progress);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [value]);

  return (
    <span className={className}>
      {prefix}
      {displayed}
      {suffix}
    </span>
  );
}
