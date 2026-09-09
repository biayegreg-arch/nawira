import {
  Heart,
  Zap,
  Activity,
  Droplet,
  Moon,
  Brain,
  BookOpen,
  ArrowRight,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Topic {
  icon: typeof Heart;
  label: string;
  question: string;
  color: string;
}

const TOPICS: Topic[] = [
  {
    icon: Heart,
    label: 'Mon cycle',
    question: 'Peux-tu m’expliquer les phases de mon cycle ?',
    color: '#D968A6',
  },
  {
    icon: Zap,
    label: 'Énergie',
    question: 'Pourquoi je me sens fatiguée en ce moment ?',
    color: '#D9A441',
  },
  {
    icon: Activity,
    label: 'Activité',
    question: 'Quel type d’activité physique me convient selon mon cycle ?',
    color: '#8058D4',
  },
  {
    icon: Droplet,
    label: 'Nutrition',
    question: 'Que devrais-je manger cette semaine ?',
    color: '#4F9D78',
  },
  {
    icon: Moon,
    label: 'Sommeil',
    question: 'Comment améliorer mon sommeil pendant mes règles ?',
    color: '#6C43C1',
  },
  {
    icon: Brain,
    label: 'Bien-être mental',
    question: 'Comment gérer les sautes d’humeur liées à mon cycle ?',
    color: '#D968A6',
  },
  {
    icon: Heart,
    label: 'Vie intime',
    question: 'Comment mon cycle affecte-t-il ma libido ?',
    color: '#B79AE8',
  },
  {
    icon: BookOpen,
    label: 'Ressources',
    question: 'Où puis-je trouver plus d’informations fiables sur la santé féminine ?',
    color: '#8058D4',
  },
];

interface TopicsProps {
  onTopicClick: (question: string) => void;
}

/** Horizontal scrollable chip row — used below `md`, where a permanent side column doesn't fit. */
export function TopicsChipRow({ onTopicClick }: TopicsProps): React.JSX.Element {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="list">
      {TOPICS.map((topic) => (
        <button
          key={topic.label}
          type="button"
          role="listitem"
          onClick={() => onTopicClick(topic.question)}
          className="flex min-h-12 flex-shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-navy hover:bg-gray-50"
        >
          <topic.icon size={16} style={{ color: topic.color }} />
          {topic.label}
        </button>
      ))}
    </div>
  );
}

/** Vertical sidebar list — used at `md` and up, matching Banani's desktop layout. */
export function TopicsSidebar({ onTopicClick }: TopicsProps): React.JSX.Element {
  return (
    <div className="flex flex-col font-body">
      <div className="mb-6 border-b border-border pb-6">
        <h2 className="text-base font-bold text-navy">Thèmes</h2>
        <p className="mt-1 text-xs text-muted-foreground">Clique pour explorer</p>
      </div>

      <div className="space-y-2">
        {TOPICS.map((topic) => (
          <button
            key={topic.label}
            type="button"
            onClick={() => onTopicClick(topic.question)}
            className={cn(
              'flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100',
            )}
          >
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${topic.color}20`, color: topic.color }}
            >
              <topic.icon size={16} />
            </div>
            <span className="text-sm font-medium text-navy">{topic.label}</span>
            <ArrowRight size={12} className="ml-auto text-muted-light" />
          </button>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-6 text-xs text-muted-foreground">
        <Info size={12} className="mr-1 inline" />
        Les réponses de NAWIRA sont basées sur tes données et sur des connaissances médicales
        vérifiées.
      </div>
    </div>
  );
}
