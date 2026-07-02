import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQAMode } from '@/contexts/QAModeContext';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import {
  type QARunRow,
  type QALogRow,
  type QACustomTestRow,
  displayStatus,
  fmtDuration,
} from './qaResultsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ArrowLeft, CheckCircle2, XCircle, ChevronRight, HelpCircle } from 'lucide-react';

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const customStatusBadgeClass = (status: string): string => {
  if (status === 'passed') return 'bg-green-100 text-green-900 border-green-300';
  if (status === 'failed') return 'bg-red-100 text-red-900 border-red-300';
  if (status === 'error') return 'bg-red-100 text-red-900 border-red-300';
  if (status === 'running') return 'bg-blue-100 text-blue-900 border-blue-300';
  return 'bg-slate-100 text-slate-800 border-slate-300';
};

export const TestResultsScreen = () => {
  const { isQAMode } = useQAMode();
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab = (location.state as any)?.tab === 'custom' ? 'custom' : 'automated';
  const [tab, setTab] = useState<'automated' | 'custom'>(initialTab);

  // Automated tab state
  const [latestRun, setLatestRun] = useState<QARunRow | null>(null);
  const [latestLogs, setLatestLogs] = useState<QALogRow[]>([]);
  const [pastRuns, setPastRuns] = useState<QARunRow[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<Record<string, QALogRow[]>>({});

  // Custom tab state
  const [customTests, setCustomTests] = useState<QACustomTestRow[]>([]);
  const [expandedCustomId, setExpandedCustomId] = useState<string | null>(null);

  const loadAutomated = useCallback(async () => {
    const { data: runs } = await supabase
      .from(table('qa_test_runs') as any)
      .select('*')
      .eq('build_type', 'qa')
      .order('started_at', { ascending: false })
      .limit(20);
    const rows = (runs as any) ?? [];
    setPastRuns(rows);

    const latest = rows[0] ?? null;
    setLatestRun(latest);
    if (latest) {
      const { data: logs } = await supabase
        .from(table('qa_test_logs') as any)
        .select('*')
        .eq('test_run_id', latest.run_id) // run_id, NOT id
        .order('started_at', { ascending: true });
      setLatestLogs((logs as any) ?? []);
    } else {
      setLatestLogs([]);
    }
  }, []);

  const loadCustom = useCallback(async () => {
    const { data } = await supabase
      .from(table('qa_custom_tests') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setCustomTests((data as any) ?? []);
  }, []);

  useEffect(() => {
    if (!isQAMode) return;
    void loadAutomated();
    void loadCustom();
  }, [isQAMode, loadAutomated, loadCustom]);

  if (!isQAMode) return <Navigate to="/" replace />;

  const expandRun = async (run: QARunRow) => {
    if (expandedRunId === run.run_id) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(run.run_id);
    if (!runLogs[run.run_id]) {
      const { data } = await supabase
        .from(table('qa_test_logs') as any)
        .select('*')
        .eq('test_run_id', run.run_id) // run_id, NOT id
        .order('started_at', { ascending: true });
      setRunLogs((prev) => ({ ...prev, [run.run_id]: (data as any) ?? [] }));
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/qa/run-tests')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Run Tests
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Test Results</h1>
        <p className="text-sm text-muted-foreground">
          Current run results and past runs, for both automated and custom tests.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'automated' | 'custom')}>
        <TabsList>
          <TabsTrigger value="automated">Automated Test Results</TabsTrigger>
          <TabsTrigger value="custom">Custom Test Results</TabsTrigger>
        </TabsList>

        <TabsContent value="automated" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Results
                {latestRun && (
                  <Badge
                    variant="outline"
                    className={
                      displayStatus(latestRun) === 'passed'
                        ? 'bg-green-100 text-green-900 border-green-300'
                        : 'bg-red-100 text-red-900 border-red-300'
                    }
                  >
                    {displayStatus(latestRun)} · {latestRun.passed_tests ?? 0}/
                    {latestRun.total_tests ?? 0} passed
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!latestRun || latestLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {latestLogs.map((l, i) => (
                    <div key={l.id}>
                      <div className="flex items-start gap-3 py-1.5">
                        {l.status === 'passed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{l.test_name}</span>
                            {l.module_name && (
                              <span className="text-xs text-muted-foreground">
                                {l.module_name}
                              </span>
                            )}
                          </div>
                          {l.error_message && (
                            <div className="text-xs text-red-700 mt-0.5 break-words">
                              {l.error_message}
                            </div>
                          )}
                        </div>
                      </div>
                      {i < latestLogs.length - 1 && <div className="border-b" />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Past runs</CardTitle>
            </CardHeader>
            <CardContent>
              {pastRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No past runs found.</p>
              ) : (
                <div className="space-y-2">
                  {pastRuns.map((run) => {
                    const status = displayStatus(run);
                    const isOpen = expandedRunId === run.run_id;
                    const logs = runLogs[run.run_id] ?? [];
                    return (
                      <Collapsible
                        key={run.run_id}
                        open={isOpen}
                        onOpenChange={() => void expandRun(run)}
                        className="border rounded-md"
                      >
                        <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30">
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                          <Badge
                            variant="outline"
                            className={
                              status === 'passed'
                                ? 'bg-green-100 text-green-900 border-green-300'
                                : status === 'failed'
                                ? 'bg-red-100 text-red-900 border-red-300'
                                : 'bg-slate-100 text-slate-800 border-slate-300'
                            }
                          >
                            {status}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              {run.passed_tests ?? 0}/{run.total_tests ?? 0} passed
                              {(run.failed_tests ?? 0) > 0 && (
                                <span className="text-red-700">
                                  {' '}· {run.failed_tests} failed
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {run.started_at
                                ? new Date(run.started_at).toLocaleString()
                                : '—'}{' '}
                              · {fmtDuration(run.started_at, run.completed_at)}
                            </div>
                          </div>
                          <code className="text-[10px] text-muted-foreground hidden md:inline">
                            {run.run_id.slice(0, 8)}
                          </code>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-1 space-y-1.5 border-t bg-muted/20">
                            {logs.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">
                                Loading logs…
                              </p>
                            ) : (
                              logs.map((l) => (
                                <div
                                  key={l.id}
                                  className="flex items-start gap-2 py-1"
                                >
                                  {l.status === 'passed' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium">
                                      {l.test_name}
                                      {l.module_name && (
                                        <span className="text-muted-foreground font-normal">
                                          {' '}· {l.module_name}
                                        </span>
                                      )}
                                    </div>
                                    {l.error_message && (
                                      <div className="text-[11px] text-red-700 break-words">
                                        {l.error_message}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Custom tests</CardTitle>
            </CardHeader>
            <CardContent>
              {customTests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom tests run yet.</p>
              ) : (
                <div className="space-y-2">
                  {customTests.map((t) => {
                    const isOpen = expandedCustomId === t.id;
                    return (
                      <Collapsible
                        key={t.id}
                        open={isOpen}
                        onOpenChange={() =>
                          setExpandedCustomId(isOpen ? null : t.id)
                        }
                        className="border rounded-md"
                      >
                        <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30">
                          <ChevronRight
                            className={`h-4 w-4 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                          />
                          {t.pass === true ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : t.pass === false ? (
                            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                          ) : (
                            <HelpCircle className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{truncate(t.prompt, 80)}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.run_at ? new Date(t.run_at).toLocaleString() : '—'}
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${customStatusBadgeClass(t.status)}`}>
                            {t.status}
                          </Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-muted/20 text-sm">
                            {t.page_context && (
                              <div className="text-xs text-muted-foreground">
                                Context: {t.page_context}
                              </div>
                            )}
                            {t.ai_plan && (
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  Test Plan
                                </div>
                                <p className="whitespace-pre-wrap text-sm">{t.ai_plan}</p>
                              </div>
                            )}
                            {t.ai_result && (
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  Result
                                </div>
                                <p className="whitespace-pre-wrap text-sm">{t.ai_result}</p>
                              </div>
                            )}
                            {t.error_message && (
                              <div className="text-xs text-red-700 break-words">
                                {t.error_message}
                              </div>
                            )}
                            {Array.isArray(t.steps_taken) && t.steps_taken.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-muted-foreground mb-1">
                                  Steps Taken
                                </div>
                                {t.steps_taken.map((s, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-medium">{s.step}</span>
                                    {' — '}
                                    <span className="text-muted-foreground">{s.outcome}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TestResultsScreen;
