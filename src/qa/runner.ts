import { supabase } from '@/integrations/supabase/client';
import { table } from '@/lib/tableRouter';
import { getActionById, allQAActions } from '@/qa/actions/registry';
import { allQAFlows } from '@/qa/flows/registry';
import type { QATestContext, QATestStepResult } from '@/qa/types';

function createContext(runId: string): QATestContext {
  const memory: Record<string, any> = {};
  return {
    runId,
    memory,
    remember: (key, value) => {
      memory[key] = value;
    },
    recall: (key) => {
      const [root, ...path] = key.split('.');
      let val = memory[root];
      for (const p of path) val = val?.[p];
      return val;
    },
  };
}

function resolveInput(
  inputs: Record<string, any> | undefined,
  fields: { key: string; fromContext?: string; default?: any }[],
  ctx: QATestContext,
) {
  const resolved: Record<string, any> = {};
  for (const field of fields) {
    if (inputs?.[field.key] !== undefined) {
      resolved[field.key] = inputs[field.key];
    } else if (field.fromContext) {
      resolved[field.key] = ctx.recall(field.fromContext);
    } else if (field.default !== undefined) {
      resolved[field.key] = field.default;
    }
  }
  return resolved;
}

async function logStep(
  runId: string,
  testName: string,
  moduleName: string,
  result: { pass: boolean; output?: any; errorMessage?: string },
  durationMs: number,
) {
  await supabase.from(table('qa_test_logs') as any).insert({
    test_run_id: runId,
    test_name: testName,
    module_name: moduleName,
    status: result.pass ? 'passed' : 'failed',
    started_at: new Date(Date.now() - durationMs).toISOString(),
    completed_at: new Date().toISOString(),
    error_message: result.errorMessage ?? null,
    assertion_details: { pass: result.pass },
    metadata_json: { durationMs, output: result.output ?? null },
  });
}

export async function startRun(): Promise<string> {
  const runId = crypto.randomUUID();
  await supabase.from(table('qa_test_runs') as any).insert({
    run_id: runId,
    build_type: 'qa',
    started_at: new Date().toISOString(),
    overall_status: 'running',
  });
  return runId;
}

export async function finishRun(runId: string, results: { pass: boolean }[]) {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  await supabase
    .from(table('qa_test_runs') as any)
    .update({
      completed_at: new Date().toISOString(),
      overall_status: failed === 0 ? 'passed' : 'failed',
      total_tests: results.length,
      passed_tests: passed,
      failed_tests: failed,
    })
    .eq('run_id', runId);
}

export async function runSingleAction(
  actionId: string,
  runId: string,
  overrides?: Record<string, any>,
) {
  const action = getActionById(actionId);
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  if (action.skipped) {
    const skipResult = {
      pass: false,
      errorMessage: action.skippedReason ?? 'Manual step required',
    };
    await logStep(runId, action.label, action.entity, skipResult, 0);
    return { actionLabel: action.label, ...skipResult, durationMs: 0, manual: true };
  }

  const ctx = createContext(runId);
  const input = resolveInput(overrides, action.inputs, ctx);
  const start = performance.now();
  let result: { pass: boolean; output?: any; errorMessage?: string };
  try {
    result = await action.run(input, ctx);
  } catch (e: any) {
    result = { pass: false, errorMessage: e?.message ?? String(e) };
  } finally {
    // Always return to the Run Tests screen between actions so the next
    // action starts from a known location, even after a thrown failure.
    try {
      const { goTo } = await import('@/qa/automation/navigate');
      await goTo('/qa/run-tests');
    } catch {
      /* navigator not registered (non-QA build) — ignore */
    }
  }
  const durationMs = performance.now() - start;

  await logStep(runId, action.label, action.entity, result, durationMs);
  return { actionLabel: action.label, ...result, durationMs };
}

export async function runFlow(flowId: string, runId: string) {
  const flow = allQAFlows.find((f) => f.id === flowId);
  if (!flow) throw new Error(`Unknown flow: ${flowId}`);

  const ctx = createContext(runId);
  const results: (QATestStepResult & { actionLabel: string })[] = [];

  for (const step of flow.steps) {
    const action = getActionById(step.actionId);
    if (!action) {
      const row = {
        pass: false,
        errorMessage: `Unknown action ${step.actionId}`,
        durationMs: 0,
        actionLabel: step.actionId,
      };
      await logStep(runId, `${flow.label} → ${step.actionId}`, 'Flow', row, 0);
      results.push(row);
      if (flow.stopOnFailure) break;
      continue;
    }

    if (action.skipped) {
      const row = {
        pass: false,
        errorMessage: action.skippedReason ?? 'Manual step required',
        durationMs: 0,
        actionLabel: action.label,
      };
      await logStep(runId, `${flow.label} → ${action.label}`, action.entity, row, 0);
      results.push(row);
      if (flow.stopOnFailure) break;
      continue;
    }

    const input = resolveInput(step.input, action.inputs, ctx);
    const start = performance.now();
    let result: { pass: boolean; output?: any; errorMessage?: string };
    try {
      result = await action.run(input, ctx);
    } catch (e: any) {
      result = { pass: false, errorMessage: e?.message ?? String(e) };
    } finally {
      try {
        const { goTo } = await import('@/qa/automation/navigate');
        await goTo('/qa/run-tests');
      } catch {
        /* navigator not registered — ignore */
      }
    }
    const durationMs = performance.now() - start;

    await logStep(runId, `${flow.label} → ${action.label}`, action.entity, result, durationMs);
    results.push({ actionLabel: action.label, ...result, durationMs });

    if (!result.pass && flow.stopOnFailure) break;
  }
  return results;
}

// Re-export for convenience.
export { allQAActions };
