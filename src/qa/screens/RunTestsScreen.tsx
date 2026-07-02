import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQAMode } from '@/contexts/QAModeContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, PencilLine, BarChart3, ChevronRight } from 'lucide-react';
import { isQaRunInProgress } from '@/qa/automation/qaRunState';

const HUB_CARDS = [
  {
    to: '/qa/run-tests/automated',
    icon: Bot,
    label: 'Open Automated Tests',
    description: 'Run pre-built flows and individual actions',
  },
  {
    to: '/qa/run-tests/custom',
    icon: PencilLine,
    label: 'Add Your Own Test',
    description: 'Describe a test in plain English and run it',
  },
  {
    to: '/qa/run-tests/results',
    icon: BarChart3,
    label: 'View Test Results',
    description: 'See current run results and past runs',
  },
];

export const RunTestsScreen = () => {
  const { isQAMode } = useQAMode();
  const navigate = useNavigate();

  useEffect(() => {
    // An automated run passes through this route between every action —
    // don't let the hub interrupt it (see qaRunState.ts).
    if (isQAMode && isQaRunInProgress()) {
      navigate('/qa/run-tests/automated', { replace: true });
    }
  }, [isQAMode, navigate]);

  if (!isQAMode) return <Navigate to="/" replace />;
  if (isQaRunInProgress()) return null;

  return (
    <div className="container mx-auto max-w-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Run Tests</h1>
          <p className="text-sm text-muted-foreground">QA-only test harness.</p>
        </div>
        <Badge variant="outline" className="bg-yellow-100 text-yellow-900 border-yellow-300">
          QA build
        </Badge>
      </div>

      <div className="space-y-3">
        {HUB_CARDS.map(({ to, icon: Icon, label, description }) => (
          <Card
            key={to}
            role="button"
            tabIndex={0}
            onClick={() => navigate(to)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(to);
            }}
            className="cursor-pointer border-amber-200 hover:bg-amber-50/60 transition-colors"
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div className="shrink-0 rounded-full bg-amber-100 p-3">
                <Icon className="h-6 w-6 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base">{label}</div>
                <div className="text-sm text-muted-foreground">{description}</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RunTestsScreen;
