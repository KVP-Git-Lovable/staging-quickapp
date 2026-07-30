/**
 * PostgREST caps a single select at 1000 rows. Any table where a profile can hold
 * more than 1000 rows (e.g. profile_object_permissions for System Administrator)
 * MUST be paged, otherwise recently added rows silently disappear from the client.
 */
export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}
