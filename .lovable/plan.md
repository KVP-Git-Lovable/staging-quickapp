## 1. Simulation Considerations panel

File: `src/modules/quickapp-ai/components/AgentDetailSheet.tsx`

- Add a static, per-agent lookup keyed by the agent key already stored in `ai_agents` (`visit_optimiser`, `churn_detector`), each holding a heading, a list of deterministic signals, and a footnote. Purely presentational constants — no queries, no props, no effect on `runSimulation`.
- Render the panel inside the existing drawer, directly **above** the "Run Simulation" button (below the status/stage/duration tiles), so it is always visible whether or not a run has happened.
- Visit Optimiser signals: days since last retailer visit, pending payment / outstanding dues, recent retailer productivity, historical order value, visit frequency, retailer priority score, beat sequencing, geographic proximity, route efficiency, existing visit plan for today.
  Footnote: "These factors are analysed using deterministic business rules before AI generates a human-readable recommendation. No business data is modified during Simulation."
- Churn Detector signals: recent order values, previous sales period comparison, 90-day sales trend, retailer ordering frequency, declining purchase patterns, confirmed order history, historical productivity, visit history, existing retailer performance indicators.
  Footnote: "Simulation analyses historical business data using deterministic calculations only. AI summarises the findings after the analysis completes."
- Agents without an entry (the `coming_soon` ones) simply render nothing — no layout change for them.

Styling: reuse the existing callout language already used elsewhere in the drawer (rounded border + tinted background + compact padding + small text). Soft cream/amber tint (`amber-50` background, `amber-200` border, `amber-900` text, dark-mode-safe variants), a small `Info` icon from the lucide set already imported in the file, heading "Simulation Considerations", and the signals as a compact two-column bulleted list on wider drawers.

Behaviour: read-only text only — no state, no handlers, no network calls, no change to simulation results or history rendering.

## 2. QuickApp AI navigation icon

File: `src/components/Navbar.tsx`

- The side menu item `{ id: 'quickapp-ai', icon: BrainCircuit, ... }` currently uses `BrainCircuit`. Change its `icon` to `Sparkles` — the same lucide component already imported in this file and rendered in the topbar shortcut (`<Sparkles size={18} />`).
- The item's coloured gradient container (`from-blue-500 to-violet-600`) and all sizing/label logic stay exactly as they are; only the icon component changes.
- No other nav entries touched. `BrainCircuit` stays imported only if still used elsewhere in the file; otherwise the import is trimmed.

Optionally (say if you want it): the QuickApp AI module's own sidebar header in `AiModuleShell.tsx` also shows a `BrainCircuit` next to the "QuickApp AI" title — I can switch that to `Sparkles` too for consistency. Default is to leave it unchanged unless you confirm.

## Technical notes

- No database, edge function, or hook changes. `ai-workflow-run` and `useAiWorkflows` are untouched.
- Signal lists are UI copy, not derived from the engine, so they carry a short code comment noting they must be kept in step with `supabase/functions/ai-workflow-run` scoring inputs.
