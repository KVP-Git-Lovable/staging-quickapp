import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQAMode } from '@/contexts/QAModeContext';
import { actionsByEntity } from '@/qa/actions/registry';
import { allQAFlows } from '@/qa/flows/registry';
import { runSingleAction, runFlow, startRun, finishRun } from '@/qa/runner';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { setQaRunInProgress } from '@/qa/automation/qaRunState';
import {
  type ResultRow,
  type QARunRow,
  displayStatus,
  logsToRows,
} from './qaResultsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

export const AutomatedTestsScreen = () => {
  const { isQAMode } = useQAMode();
  const navigate = useNavigate();

  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [completedRun, setCompletedRun] = useState<QARunRow | null>(null);

  const grouped = useMemo(() => actionsByEntity(), []);

  if (!isQAMode) return <Navigate to="/" replace />;

  const toggleAction = (id: string) =>
    setSelectedActions((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );

  const toggleFlow = (id: string) =>
    setSelectedFlows((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );

  const totalSelected = selectedActions.length + selectedFlows.length;

  const runSelected = async () => {
    setRunning(true);
    setQaRunInProgress(true);
    setResults([]);
    setCompletedRun(null);
    let runId: string | null = null;
    const all: ResultRow[] = [];
    try {
      runId = await startRun();
      setCurrentRunId(runId);

      for (const flowId of selectedFlows) {
        try {
          const flowResults = await runFlow(flowId, runId);
          for (const r of flowResults) {
            const row: ResultRow = {
              label: r.actionLabel,
              pass: r.pass,
              durationMs: r.durationMs,
              errorMessage: r.errorMessage,
            };
            all.push(row);
            setResults((prev) => [...prev, row]);
          }
        } catch (e: any) {
          const row: ResultRow = { label: flowId, pass: false, durationMs: 0, errorMessage: e?.message ?? String(e) };
          all.push(row);
          setResults((prev) => [...prev, row]);
        }
      }

      for (const actionId of selectedActions) {
        try {
          setCurrentLabel(actionId);
          const r: any = await runSingleAction(actionId, runId);
          const row: ResultRow = {
            label: r.actionLabel,
            pass: r.pass,
            durationMs: r.durationMs,
            errorMessage: r.errorMessage,
            manual: r.manual,
          };
          all.push(row);
          setResults((prev) => [...prev, row]);
        } catch (e: any) {
          const row: ResultRow = { label: actionId, pass: false, durationMs: 0, errorMessage: e?.message ?? String(e) };
          all.push(row);
          setResults((prev) => [...prev, row]);
        }
      }
      setCurrentLabel(null);

      if (runId) await finishRun(runId, all);
    } catch (e: any) {
      const row: ResultRow = { label: 'Run setup', pass: false, durationMs: 0, errorMessage: e?.message ?? String(e) };
      setResults((prev) => [...prev, row]);
    } finally {
      setRunning(false);
      setQaRunInProgress(false);
    }

    // Authoritative DB re-fetch — mirror exactly what got persisted so
    // any streaming-state gap (thrown steps, races) can't leave the UI
    // showing stale/incomplete results.
    if (runId) {
      try {
        const { data: runData } = await supabase
          .from(table('qa_test_runs') as any)
          .select('*')
          .eq('run_id', runId) // run_id, NOT id
          .maybeSingle();

        const { data: logData } = await supabase
          .from(table('qa_test_logs') as any)
          .select('*')
          .eq('test_run_id', runId) // run_id, NOT id
          .order('started_at', { ascending: true });

        if (runData) setCompletedRun(runData as any);
        if (logData) setResults(logsToRows(logData as any));
      } catch {
        /* keep streaming results as fallback */
      }
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/qa/run-tests')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Run Tests
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Automated Tests</h1>
          <p className="text-sm text-muted-foreground">
            QA-only test harness. Results are logged to{' '}
            <code className="text-xs">qa_test_runs</code> /{' '}
            <code className="text-xs">qa_test_logs</code>.
          </p>
        </div>
        <Badge variant="outline" className="bg-yellow-100 text-yellow-900 border-yellow-300">
          QA build
        </Badge>
      </div>

      <Card className="border-amber-300 bg-amber-50/60">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-amber-900">
            Tests drive the real app UI — you will see the app navigate between
            screens automatically while a test runs. This is expected. Each test
            passes only when the UI confirms success <em>and</em> a matching{' '}
            <code>qa_*</code> row is found. Flows requiring native capabilities
            (camera, GPS) are marked <strong>Manual step required</strong>.
          </p>
        </CardContent>
      </Card>

      {running && currentLabel && (
        <Card className="border-blue-300 bg-blue-50/60">
          <CardContent className="flex items-center gap-3 p-3 text-sm text-blue-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Running: <strong>{currentLabel}</strong>…</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Flows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allQAFlows.map((flow) => (
            <label
              key={flow.id}
              className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer"
            >
              <Checkbox
                checked={selectedFlows.includes(flow.id)}
                onCheckedChange={() => toggleFlow(flow.id)}
                disabled={running}
              />
              <div className="flex-1">
                <div className="font-medium">{flow.label}</div>
                {flow.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {flow.description}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {flow.steps.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {s.actionId}
                    </Badge>
                  ))}
                </div>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Individual actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(grouped).map(([entity, actions]) => (
            <div key={entity}>
              <div className="text-sm font-semibold text-muted-foreground mb-2">
                {entity}
              </div>
              <div className="space-y-2">
                {actions.map((action) => (
                  <label
                    key={action.id}
                    className="flex items-start gap-3 p-2.5 rounded-md border hover:bg-muted/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedActions.includes(action.id)}
                      onCheckedChange={() => toggleAction(action.id)}
                      disabled={running}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{action.label}</span>
                        <code className="text-[10px] text-muted-foreground">
                          {action.id}
                        </code>
                        {action.skipped && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-100 text-amber-900 border-amber-300"
                          >
                            Manual step
                          </Badge>
                        )}
                      </div>
                      {action.skipped && action.skippedReason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {action.skippedReason}
                        </div>
                      )}
                      {action.description && !action.skipped && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {action.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 sticky bottom-4">
        <Button
          onClick={runSelected}
          disabled={running || totalSelected === 0}
          size="lg"
          className="shadow-lg"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running…
            </>
          ) : (
            <>Run Selected ({totalSelected})</>
          )}
        </Button>
        {currentRunId && (
          <span className="text-xs text-muted-foreground">
            run_id: <code>{currentRunId}</code>
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Results
            {completedRun && (
              <Badge
                variant="outline"
                className={
                  displayStatus(completedRun) === 'passed'
                    ? 'bg-green-100 text-green-900 border-green-300'
                    : 'bg-red-100 text-red-900 border-red-300'
                }
              >
                {displayStatus(completedRun)} · {completedRun.passed_tests ?? 0}/
                {completedRun.total_tests ?? 0} passed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i}>
                    <div className="flex items-start gap-3 py-1.5">
                      {r.manual ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      ) : r.pass ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.durationMs.toFixed(0)}ms
                          </span>
                          {r.manual && (
                            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-300">
                              Manual step required
                            </Badge>
                          )}
                        </div>
                        {r.errorMessage && (
                          <div className="text-xs text-red-700 mt-0.5 break-words">
                            {r.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    {i < results.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AutomatedTestsScreen;
