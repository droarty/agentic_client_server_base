// Drizzle's `sql` template tag expands an interpolated JS array into a
// comma-separated list of placeholders (built for `IN (...)` clauses), not a
// single Postgres array parameter — so passing e.g. `path: string[]` through
// `sql\`...${path}::text[]...\`` silently binds only the first element as a
// bare scalar and fails to cast. Build the Postgres array-literal text format
// ourselves and pass it as one string parameter instead. Reused by the
// jsonb_array_* SQL functions' callers (both tests and, from Phase 4 on,
// DatabasePersistor.ts).
export function toPgTextArray(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}
