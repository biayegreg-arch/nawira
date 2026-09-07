import { CheckCircle2, Circle } from 'lucide-react';

export interface ProgressStep {
  key: string;
  label: string;
  filled: boolean;
}

interface LogProgressBarProps {
  steps: ProgressStep[];
}

export function LogProgressBar({ steps }: LogProgressBarProps): React.JSX.Element {
  return (
    <div className="mb-6 flex items-center gap-3 overflow-x-auto rounded-xl border border-border bg-white p-4">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-3">
          {i > 0 && <div className="h-4 w-px shrink-0 bg-border" />}
          <div
            className={`flex shrink-0 items-center gap-2 text-xs font-medium whitespace-nowrap ${
              step.filled ? 'text-green' : 'text-muted-foreground'
            }`}
          >
            {step.filled ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {step.label}
          </div>
        </div>
      ))}
    </div>
  );
}
