import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQAMode } from '@/contexts/QAModeContext';
import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { type QACustomTestRow } from './qaResultsShared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const statusBadgeClass = (status: string): string => {
  if (status === 'passed') return 'bg-green-100 text-green-900 border-green-300';
  if (status === 'failed' || status === 'error') return 'bg-red-100 text-red-900 border-red-300';
  if (status === 'running') return 'bg-blue-100 text-blue-900 border-blue-300';
  return 'bg-slate-100 text-slate-800 border-slate-300';
};

interface RunResult {
  ai_plan: string;
  ai_result: string;
  pass: boolean;
  steps_taken: { step: string; outcome: string }[];
}

export const CustomTestScreen = () => {
  const { isQAMode } = useQAMode();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState('');
  const [pageContext, setPageContext] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const [recentTests, setRecentTests] = useState<QACustomTestRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return;

    const { data } = await supabase
      .from(table('qa_custom_tests') as any)
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentTests((data as any) ?? []);
  }, []);

  useEffect(() => {
    if (isQAMode) void loadRecent();
  }, [isQAMode, loadRecent]);

  if (!isQAMode) return <Navigate to="/" replace />;

  const runTest = async () => {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      const { data: inserted, error: insErr } = await supabase
        .from(table('qa_custom_tests') as any)
        .insert({
          prompt: prompt.trim(),
          page_context: pageContext.trim() || null,
          status: 'running',
          created_by: userId,
          run_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (insErr || !inserted) {
        throw new Error(insErr?.message ?? 'Failed to save test prompt');
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'qa-custom-test-analyst',
        {
          body: {
            testId: (inserted as any).id,
            prompt: prompt.trim(),
            pageContext: pageContext.trim() || null,
          },
        },
      );

      if (fnError || !fnData || fnData.error) {
        throw new Error(fnData?.error ?? fnError?.message ?? 'AI analysis failed');
      }

      setResult({
        ai_plan: fnData.ai_plan,
        ai_result: fnData.ai_result,
        pass: fnData.pass,
        steps_taken: fnData.steps_taken ?? [],
      });
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setRunning(false);
      void loadRecent();
    }
  };

  const runAgain = () => {
    setPrompt('');
    setPageContext('');
    setResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="container mx-auto max-w-3xl p-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/qa/run-tests')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Back to Run Tests
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Add Your Own Test</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you want to test in plain English. The AI will analyse the
          request, outline what it will check, and report a pass or fail with
          reasoning.
        </p>
      </div>

      {!result && !errorMsg && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qa-custom-prompt">What would you like to test?</Label>
              <Textarea
                id="qa-custom-prompt"
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={running}
                placeholder={
                  "Example: I want to test the 'Activity' button on the /events page " +
                  'and check if a new activity created there appears in the Activity ' +
                  'Log section...'
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-custom-context">Page or feature context (optional)</Label>
              <Input
                id="qa-custom-context"
                value={pageContext}
                onChange={(e) => setPageContext(e.target.value)}
                disabled={running}
                placeholder="e.g. /events, Orders screen, Attendance flow"
              />
            </div>
            <Button onClick={runTest} disabled={running || !prompt.trim()}>
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysing your test prompt…
                </>
              ) : (
                'Run This Test'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {errorMsg && (
        <Card className="border-red-300">
          <CardContent className="p-4 space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button onClick={runTest} disabled={running}>
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Retrying…
                  </>
                ) : (
                  'Retry'
                )}
              </Button>
              <Button variant="outline" onClick={runAgain}>
                Run Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{result.ai_plan}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Result
                <Badge
                  variant="outline"
                  className={
                    result.pass
                      ? 'bg-green-100 text-green-900 border-green-300'
                      : 'bg-red-100 text-red-900 border-red-300'
                  }
                >
                  {result.pass ? 'PASS' : 'FAIL'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{result.ai_result}</p>
              {result.steps_taken.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t">
                  {result.steps_taken.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {result.pass ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium">{s.step}</span>
                        {' — '}
                        <span className="text-muted-foreground">{s.outcome}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-4">
            <Button onClick={runAgain}>Run Again</Button>
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => navigate('/qa/run-tests/results', { state: { tab: 'custom' } })}
            >
              View in Past Results
            </button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Past custom tests</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom tests run yet.</p>
          ) : (
            <div className="space-y-2">
              {recentTests.map((t) => {
                const isOpen = expandedId === t.id;
                return (
                  <Collapsible
                    key={t.id}
                    open={isOpen}
                    onOpenChange={() => setExpandedId(isOpen ? null : t.id)}
                    className="border rounded-md"
                  >
                    <CollapsibleTrigger className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30">
                      <ChevronRight
                        className={`h-4 w-4 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                      />
                      <span className="flex-1 min-w-0 text-sm truncate">
                        {truncate(t.prompt, 80)}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(t.status)}`}>
                        {t.status}
                      </Badge>
                      {t.pass === true && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                      {t.pass === false && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-1 space-y-2 border-t bg-muted/20 text-sm">
                        {t.ai_plan && (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground mb-1">
                              Test Plan
                            </div>
                            <p className="whitespace-pre-wrap">{t.ai_plan}</p>
                          </div>
                        )}
                        {t.ai_result && (
                          <div>
                            <div className="text-xs font-semibold text-muted-foreground mb-1">
                              Result
                            </div>
                            <p className="whitespace-pre-wrap">{t.ai_result}</p>
                          </div>
                        )}
                        {t.error_message && (
                          <div className="text-xs text-red-700 break-words">{t.error_message}</div>
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
    </div>
  );
};

export default CustomTestScreen;
