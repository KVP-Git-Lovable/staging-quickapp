// Lovable AI Gateway helper for Deno edge functions.
// Wraps @ai-sdk/openai-compatible so streamText/generateText/tool() work
// against Lovable AI Gateway with proper headers and run-id capture.
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@3.0.7";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (v: string | undefined) => void = () => {};
  let resolved = false;
  const runIdReady = new Promise<string | undefined>((r) => { resolveRunId = r; });
  const publish = (v?: string) => {
    const n = v?.trim() || undefined;
    if (!runId && n) runId = n;
    if (!resolved) { resolved = true; resolveRunId(runId); }
  };
  if (runId) publish(runId);
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const res = await fetch(input, { ...init, headers });
        publish(res.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return res;
      } catch (e) {
        publish(undefined);
        throw e;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

export function createLovableAiGatewayProvider(
  apiKey: string,
  initialRunId?: string,
  options?: { structuredOutputs?: boolean },
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });
  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}

export function getLovableAiGatewayRunId(req: Request) {
  return req.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
}

export function getLovableAiGatewayResponseHeaders(
  providerHeaders: HeadersInit | undefined,
  init?: HeadersInit,
) {
  const headers = new Headers(init);
  const exposed = new Set(
    (headers.get("Access-Control-Expose-Headers") ?? "")
      .split(",").map((h) => h.trim()).filter(Boolean),
  );
  new Headers(providerHeaders).forEach((v, n) => {
    if (n.toLowerCase().startsWith("x-lovable-aig-")) {
      headers.set(n, v);
      exposed.add(n);
    }
  });
  headers.forEach((_, n) => {
    if (n.toLowerCase().startsWith("x-lovable-aig-")) exposed.add(n);
  });
  if (exposed.size > 0) {
    headers.set("Access-Control-Expose-Headers", Array.from(exposed).join(", "));
  }
  return headers;
}
