/**
 * Generic helper to fetch every row from a Supabase query, working around
 * PostgREST's default 1,000-row cap by paging through `.range()` chunks.
 *
 * USAGE:
 *   const rows = await fetchAllPaginated((from, to) =>
 *     supabase
 *       .from('products')
 *       .select('id, name, ...')
 *       .eq('is_active', true)
 *       .order('name')
 *       .range(from, to)
 *   );
 *
 * The callback MUST add `.range(from, to)` to the query and return the
 * Supabase query (or a thenable resolving to `{ data, error }`).
 *
 * Stops when a page returns fewer rows than the page size, so it works
 * for tables with 0..N rows without an extra count query.
 */
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  hardLimit = 100_000
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  while (all.length < hardLimit) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }
  return all;
}

/**
 * Splits an array of ids into chunks of up to `size` (default 800, leaving
 * URL headroom under PostgREST's 1,000 cap) so callers can run multiple
 * `.in('id', chunk)` queries and concatenate the results without losing
 * rows when the id list itself exceeds the cap.
 */
export function chunkIds<T>(ids: T[], size = 800): T[][] {
  if (ids.length <= size) return [ids];
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
