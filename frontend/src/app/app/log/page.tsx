'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import {
  DailyLogForm,
  type DailyLogInitialValues,
  type DailyLogSubmitValues,
} from '@/components/log/DailyLogForm';

const EMPTY_VALUES: DailyLogInitialValues = {
  painLevel: null,
  painLocation: null,
  mood: null,
  energy: null,
  sleepQuality: null,
  sleepHours: null,
  note: null,
  symptoms: [],
};

export default function LogPage(): React.JSX.Element | null {
  const user = useUser();
  const { toast } = useToast();
  const [initialValues, setInitialValues] = useState<DailyLogInitialValues | null>(null);
  const [todayFlowLogged, setTodayFlowLogged] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [logRes, cyclesRes] = await Promise.all([
        api<{ log: DailyLogInitialValues | null }>('/api/daily-logs/today'),
        api<{ todayLogged: boolean }>('/api/cycles'),
      ]);
      setInitialValues(logRes.log ?? EMPTY_VALUES);
      setTodayFlowLogged(cyclesRes.todayLogged);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleSubmit = useCallback(
    (values: DailyLogSubmitValues) => {
      setSaving(true);
      void (async () => {
        try {
          const { flow, ...logValues } = values;
          await api('/api/daily-logs/today', { method: 'PUT', body: logValues });
          if (flow !== 'NONE') {
            await api('/api/period-events', { method: 'POST', body: { flow } });
          }
          toast('Journal enregistré.', 'success');
          await load();
        } catch (err) {
          toast(
            err instanceof ApiError ? err.message : 'Impossible d’enregistrer. Réessaie.',
            'error',
          );
        } finally {
          setSaving(false);
        }
      })();
    },
    [load, toast],
  );

  if (!user) return null;

  if (error) {
    return (
      <div className="p-4 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Impossible de charger ton journal. Réessaie plus tard.
        </div>
      </div>
    );
  }

  if (initialValues === null) {
    return (
      <div className="p-4 lg:p-8">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold text-navy">Journal du jour</h1>
      <DailyLogForm
        initialValues={initialValues}
        todayFlowLogged={todayFlowLogged}
        saving={saving}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
