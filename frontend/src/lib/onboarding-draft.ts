'use client';

import { useCallback, useState } from 'react';

export interface OnboardingDraft {
  birthDate: string | null;
  goal: 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE' | null;
  lastPeriodDate: string | null;
  usualPeriodLength: number | null;
  usualCycleLength: number | null;
  trackedConcerns: string[];
}

const STORAGE_KEY = 'onboarding-draft';

const EMPTY_DRAFT: OnboardingDraft = {
  birthDate: null,
  goal: null,
  lastPeriodDate: null,
  usualPeriodLength: null,
  usualCycleLength: null,
  trackedConcerns: [],
};

function readDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<OnboardingDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearOnboardingDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function useOnboardingDraft(): {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
} {
  const [draft, setDraft] = useState<OnboardingDraft>(readDraft);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeDraft(next);
      return next;
    });
  }, []);

  return { draft, update };
}
