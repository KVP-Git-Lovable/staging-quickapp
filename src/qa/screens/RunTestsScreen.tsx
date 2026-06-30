import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQAMode } from '@/contexts/QAModeContext';
import { actionsByEntity } from '@/qa/actions/registry';
import { allQAFlows } from '@/qa/flows/registry';
import { runSingleAction, runFlow, startRun, finishRun } from '@/qa/runner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

interface ResultRow {
  label: string;
  pass: boolean;
  durationMs: number;
  errorMessage?: string;
  manual?: boolean;
}

export const RunTestsScreen = () => {
  const { isQAMode } = useQAMode();

  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

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
    setResults([]);
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
          const r = await runSingleAction(actionId, runId);
          const row: ResultRow = {
            label: r.actionLabel,
            pass: r.pass,
            durationMs: r.durationMs,
            errorMessage: r.errorMessage,
          };
          all.push(row);
          setResults((prev) => [...prev, row]);
        } catch (e: any) {
          const row: ResultRow = { label: actionId, pass: false, durationMs: 0, errorMessage: e?.message ?? String(e) };
          all.push(row);
          setResults((prev) => [...prev, row]);
        }
      }

      if (runId) await finishRun(runId, all);
    } catch (e: any) {
      const row: ResultRow = { label: 'Run setup', pass: false, durationMs: 0, errorMessage: e?.message ?? String(e) };
      setResults((prev) => [...prev, row]);
    } finally {
      setRunning(false);
    }
  };


  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Run Tests</h1>
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
            All entity actions are currently <strong>skipped</strong> — their
            business logic still lives inline inside pages and hooks. Use the
            real screens in the QA APK to exercise <code>qa_*</code> writes via
            table-prefix routing. Service extraction will unlock these actions
            in a follow-up pass.
          </p>
        </CardContent>
      </Card>

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
                    className={`flex items-start gap-3 p-2.5 rounded-md border ${
                      action.skipped
                        ? 'opacity-60 cursor-not-allowed bg-muted/20'
                        : 'hover:bg-muted/30 cursor-pointer'
                    }`}
                  >
                    <Checkbox
                      checked={selectedActions.includes(action.id)}
                      onCheckedChange={() => toggleAction(action.id)}
                      disabled={running || action.skipped}
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
                            className="text-[10px] bg-muted text-muted-foreground"
                          >
                            skipped
                          </Badge>
                        )}
                      </div>
                      {action.skipped && action.skippedReason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {action.skippedReason}
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
          <CardTitle className="text-lg">Results</CardTitle>
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
                      {r.pass ? (
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

export default RunTestsScreen;
