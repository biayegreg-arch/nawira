import { Lightbulb } from 'lucide-react';
import type { Phase } from './CycleContextCard';

const TIPS: Record<Phase['key'], string> = {
  PERIOD:
    'Note l’intensité de tes règles chaque jour — cela aide NAWIRA à mieux estimer la durée de tes prochains cycles.',
  FERTILE:
    'Pendant la phase fertile, note tes symptômes chaque jour pour améliorer la précision des prédictions NAWIRA.',
  LUTEAL:
    'C’est une période où le SPM peut apparaître. Suivre ton humeur et ton énergie t’aide à mieux te connaître.',
  FOLLICULAR:
    'Ton énergie remonte souvent après les règles. Continue à noter tes ressentis pour affiner tes tendances.',
};

interface PhaseTipCardProps {
  phase: Phase | null;
}

export function PhaseTipCard({ phase }: PhaseTipCardProps): React.JSX.Element | null {
  if (!phase) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-primary-faint p-5">
      <div className="absolute top-1 right-2 h-16 w-16 rounded-full bg-primary-light opacity-25" />
      <div className="relative z-10">
        <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-primary">
          <Lightbulb size={12} />
          Conseil pour ta phase
        </div>
        <p className="text-xs leading-relaxed text-body">{TIPS[phase.key]}</p>
      </div>
    </div>
  );
}
