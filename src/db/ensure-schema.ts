import { getPool } from "@/db";
import { isTextType, legacyAliasesFor, quoteIdent, TABLES, type ColumnSpec, type TableSpec } from "@/db/table-map";

/**
 * Brings an existing database in line with ./schema.ts **without ever dropping
 * data**.
 *
 * The admin panel used to show an empty library on databases that were created
 * before the current Drizzle mapping: the rows were there (`select count(*)`
 * proved it) but every `SELECT`/`INSERT` referenced columns such as
 * `poster_url` that did not exist in that database, so each request failed with
 * Postgres error 42703 (`column "poster_url" of relation "movies" does not
 * exist`) and the route swallowed it into a generic 500. The UI then rendered
 * zero movies with no explanation.
 *
 * For every table we now:
 *   1. create it when it is missing;
 *   2. add the columns the mapping expects but the table does not have;
 *   3. rename a known legacy column onto the expected name (keeps the data);
 *   4. copy legacy values across when both the old and the new column exist.
 *
 * Everything is idempotent, so it is safe to run on every cold start.
 */

export interface TableReport {
  exists: boolean;
  created: boolean;
  added: string[];
  renamed: { from: string; to: string }[];
  backfilled: string[];
  skipped: string[];
}

export interface SchemaReport {
  ok: boolean;
  /** true once reconciliation completed successfully in this process */
  reconciled: boolean;
  tables: Record<string, TableReport>;
  error?: string;
}

interface ColumnInfo {
  name: string;
  dataType: string;
}

let inflight: Promise<SchemaReport> | null = null;
let lastReport: SchemaReport | null = null;

/** Reconcile the schema once per process. Never rejects — see `SchemaReport.ok`. */
export function ensureSchema(): Promise<SchemaReport> {
  if (!inflight) {
    inflight = reconcile().then((report) => {
      lastReport = report;
      if (report.ok) return report;
      inflight = null; // allow the next request to retry
      return report;
    });
  }
  return inflight;
}

/** Last known reconciliation result, for /api/health diagnostics. */
export function getSchemaReport(): SchemaReport | null {
  return lastReport;
}

async function query<T extends { rows: unknown[] }>(text: string, params: unknown[] = []): Promise<T> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result as unknown as T;
}

async function listColumns(table: string): Promise<Map<string, ColumnInfo> | null> {
  const res = await query<{ rows: { column_name: string; data_type: string }[] }>(
    `select column_name, data_type
       from information_schema.columns
      where table_name = $1
        and table_schema = any (current_schemas(false))
      order by ordinal_position`,
    [table]
  );
  if (!res.rows.length) return null; // table does not exist in any schema on the search path
  const map = new Map<string, ColumnInfo>();
  for (const row of res.rows) map.set(row.column_name, { name: row.column_name, dataType: row.data_type });
  return map;
}

function createTableSql(spec: TableSpec): string {
  const defs = spec.columns.map((column) => {
    const parts = [quoteIdent(column.name), column.sqlType];
    if (column.primary) parts.push("PRIMARY KEY");
    if (column.notNull) parts.push("NOT NULL");
    if (column.defaultSql) parts.push(`DEFAULT ${column.defaultSql}`);
    return `  ${parts.join(" ")}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(spec.name)} (\n${defs.join(",\n")}\n)`;
}

function addColumnSql(table: string, column: ColumnSpec): string {
  const parts = [quoteIdent(column.name), column.sqlType];
  // Deliberately no NOT NULL here: adding a NOT NULL column without a default to
  // a table that already holds rows is rejected by Postgres, and the existing
  // rows must survive.
  if (column.defaultSql) parts.push(`DEFAULT ${column.defaultSql}`);
  return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${parts.join(" ")}`;
}

/** Types that Postgres will move across without an explicit cast. */
function compatible(fromType: string, toType: string): boolean {
  const text = (t: string) => /char|text|uuid/i.test(t);
  const num = (t: string) => /int|numeric|decimal|real|double/i.test(t);
  const bool = (t: string) => /bool/i.test(t);
  return (text(fromType) && text(toType)) || (num(fromType) && num(toType)) || (bool(fromType) && bool(toType));
}

function backfillSql(table: string, column: ColumnSpec, from: string): string {
  const target = quoteIdent(column.name);
  const source = quoteIdent(from);
  const emptyTarget = isTextType(column.sqlType) ? `(${target} is null or ${target} = '')` : `${target} is null`;
  return `UPDATE ${quoteIdent(table)} SET ${target} = ${source} WHERE ${emptyTarget} and ${source} is not null`;
}

async function reconcileTable(spec: TableSpec): Promise<TableReport> {
  const report: TableReport = { exists: false, created: false, added: [], renamed: [], backfilled: [], skipped: [] };
  let existing = await listColumns(spec.name);

  if (!existing) {
    await query(createTableSql(spec));
    report.exists = true;
    report.created = true;
    report.added = spec.columns.map((c) => c.name);
    return report;
  }
  report.exists = true;

  // 1. Give every expected column a home, reusing legacy columns where possible.
  for (const column of spec.columns) {
    if (existing.has(column.name)) continue;
    const alias = legacyAliasesFor(spec.name, column.name).find((name) => existing.has(name));
    if (alias) {
      const from = existing.get(alias)!;
      if (!compatible(from.dataType, column.sqlType)) {
        report.skipped.push(`${alias} → ${column.name} (${from.dataType} is not ${column.sqlType})`);
        await query(addColumnSql(spec.name, column));
        existing.set(column.name, { name: column.name, dataType: from.dataType });
        report.added.push(column.name);
        continue;
      }
      await query(
        `ALTER TABLE ${quoteIdent(spec.name)} RENAME COLUMN ${quoteIdent(alias)} TO ${quoteIdent(column.name)}`
      );
      existing.delete(alias);
      existing.set(column.name, from);
      report.renamed.push({ from: alias, to: column.name });
      continue;
    }
    await query(addColumnSql(spec.name, column));
    existing.set(column.name, { name: column.name, dataType: column.sqlType });
    report.added.push(column.name);
  }

  // 2. Where an old column survived next to the new one, carry its values across.
  for (const column of spec.columns) {
    for (const alias of legacyAliasesFor(spec.name, column.name)) {
      const source = existing.get(alias);
      if (!source) continue;
      if (!compatible(source.dataType, column.sqlType)) {
        report.skipped.push(`${alias} → ${column.name} (${source.dataType} is not ${column.sqlType})`);
        continue;
      }
      await query(backfillSql(spec.name, column, alias));
      report.backfilled.push(`${alias} → ${column.name}`);
    }
  }

  return report;
}

async function reconcile(): Promise<SchemaReport> {
  const report: SchemaReport = { ok: false, reconciled: false, tables: {} };
  try {
    for (const spec of TABLES) {
      report.tables[spec.name] = await reconcileTable(spec);
    }
    report.ok = true;
    report.reconciled = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  return report;
}
