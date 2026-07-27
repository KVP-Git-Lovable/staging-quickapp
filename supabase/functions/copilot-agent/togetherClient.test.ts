import { streamChat, TogetherError } from "./services/togetherClient.ts";

function sseBody(lines: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close(); } });
}
function frame(content: string, finish: string | null = null) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`;
}
function mock(responses: (() => Response)[]) {
  let i = 0;
  globalThis.fetch = (() => Promise.resolve(responses[Math.min(i++, responses.length - 1)]())) as any;
}
async function drain(s: ReadableStream<string>) {
  let out = ""; const r = s.getReader();
  while (true) { const { value, done } = await r.read(); if (done) break; out += value; }
  return out;
}

Deno.test("normal completion", async () => {
  mock([() => new Response(sseBody([frame("Hello "), frame("world", "stop"), "data: [DONE]\n\n"]), { status: 200 })]);
  const s = await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }] });
  const text = await drain(s.tokens);
  if (text !== "Hello world") throw new Error("got " + text);
  if (s.diag.outcome !== "completed" || s.diag.deltas !== 2) throw new Error(JSON.stringify(s.diag));
});

Deno.test("premature EOF surfaces an error instead of silent truncation", async () => {
  mock([() => new Response(sseBody([frame("Partial answer")]), { status: 200 })]);
  const s = await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }] });
  let threw = false;
  try { await drain(s.tokens); } catch (e) { threw = true; if (!(e instanceof TogetherError) || e.code !== "provider_upstream") throw e; }
  if (!threw) throw new Error("expected error");
  if (s.diag.outcome !== "premature_eof") throw new Error(s.diag.outcome);
});

Deno.test("finish_reason=length continues once", async () => {
  mock([
    () => new Response(sseBody([frame("Part one", "length"), "data: [DONE]\n\n"]), { status: 200 }),
    () => new Response(sseBody([frame(" and two", "stop"), "data: [DONE]\n\n"]), { status: 200 }),
  ]);
  const s = await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }] });
  const text = await drain(s.tokens);
  if (text !== "Part one and two") throw new Error("got " + text);
  if (s.diag.continuations !== 1) throw new Error("continuations " + s.diag.continuations);
});

Deno.test("http error maps to code", async () => {
  mock([() => new Response("nope", { status: 429 })]);
  try { await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }] }); throw new Error("expected throw"); }
  catch (e) { if (!(e instanceof TogetherError) || e.code !== "rate_limited") throw e; }
});

Deno.test("caller abort closes cleanly with partial text", async () => {
  const ac = new AbortController();
  const enc = new TextEncoder();
  // Real `fetch` errors the body stream when the signal aborts; mirror that.
  mock([() => new Response(new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(frame("so far")));
      setTimeout(() => {
        ac.abort();
        c.error(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, 20);
    },
    cancel() {},
  }), { status: 200 })]);
  const s = await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }], signal: ac.signal });
  const text = await drain(s.tokens);
  if (text !== "so far") throw new Error("got " + text);
  if (s.diag.outcome !== "aborted") throw new Error(s.diag.outcome);
  if ((await s.fullText) !== "so far") throw new Error("fullText mismatch");
});

Deno.test("stalled upstream aborts instead of hanging until isolate teardown", async () => {
  const enc = new TextEncoder();
  // Real `fetch` errors the body when its signal aborts; the watchdog aborts
  // the internal signal, so wire the mock body to it the same way.
  globalThis.fetch = ((_u: string, init: RequestInit) => Promise.resolve(new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(frame("start")));
        init.signal?.addEventListener("abort", () =>
          c.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
      },
      cancel() {},
    }), { status: 200 }))) as any;
  const s = await streamChat({ apiKey: "k", messages: [{ role: "user", content: "hi" }] });
  let threw = false;
  try { await drain(s.tokens); } catch (e) { threw = true; if ((e as TogetherError).code !== "upstream_stalled") throw e; }
  if (!threw) throw new Error("expected stall error");
  if (s.diag.outcome !== "stalled") throw new Error(s.diag.outcome);
});
