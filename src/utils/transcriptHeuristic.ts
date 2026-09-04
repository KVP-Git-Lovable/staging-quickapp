// Local, on-device fallback parser for spoken order transcripts.
// Extracted VERBATIM from useVoiceOrderAssistant's inline fallback so the
// customer-portal voice assistant and the Order Scribe card share one
// implementation — no transcript leaves the device on this path.

export interface HeuristicOrder {
  productSearch: string;
  quantity: number;
  unit: string;
}

export function parseTranscriptHeuristic(normalizedText: string): HeuristicOrder[] {
  const parsedOrders: HeuristicOrder[] = [];
  // Simple heuristic: split by commas or common conjunctions
  const segments = normalizedText.split(/,|aur |and /i).map(s => s.trim()).filter(Boolean);
  for (const segment of segments) {
    // Extract trailing number as quantity
    const qtyMatch = segment.match(/(\d+)\s*(kg|kilo|pieces?|packet|packets?)?\s*$/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
    const searchPart = qtyMatch ? segment.slice(0, qtyMatch.index).trim() : segment;
    if (searchPart) {
      parsedOrders.push({ productSearch: searchPart, quantity, unit: qtyMatch?.[2] || 'kg' });
    }
  }
  return parsedOrders;
}
