import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkflowStep = { key: string; label: string; };

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'created',    label: 'Created'        },
  { key: 'allocated',  label: 'Allocated'      },
  { key: 'picking',    label: 'Picking'        },
  { key: 'packed',     label: 'Packing'        },
  { key: 'ready',      label: 'Dispatch Ready' },
  { key: 'dispatched', label: 'Dispatched'     },
  { key: 'delivered',  label: 'Delivered'      },
];

export function statusToStepIndex(status: string): number {
  switch (status) {
    case 'draft':      return 1;
    case 'picking':    return 2;
    case 'packed':     return 3;
    case 'ready':      return 4;
    case 'dispatched': return 5;
    case 'delivered':
    case 'completed':  return 6;
    default:           return 0;
  }
}

interface Props { status: string; className?: string; }

export default function StatusTimeline({ status, className }: Props) {
  const activeIdx = statusToStepIndex(status);
  return (
    <div className={cn('flex items-start gap-1 overflow-x-auto py-2', className)}>
      {WORKFLOW_STEPS.map((step, i) => {
        const isDone   = i < activeIdx;
        const isActive = i === activeIdx;
        const isFuture = i > activeIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center">
              <div className={cn(
                'h-7 w-7 rounded-full border-2 flex items-center justify-center transition-colors',
                isDone   && 'bg-primary border-primary text-primary-foreground',
                isActive && 'border-primary bg-background text-primary ring-2 ring-primary/20',
                isFuture && 'border-muted-foreground/30 bg-background text-muted-foreground'
              )}>
                {isDone
                  ? <Check className="h-3.5 w-3.5" />
                  : <Circle className="h-2.5 w-2.5 fill-current" />}
              </div>
              <span className={cn(
                'mt-1 text-[10px] whitespace-nowrap',
                isActive && 'text-primary font-semibold',
                isDone   && 'text-foreground',
                isFuture && 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={cn('h-px w-8 mt-3', isDone ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
