// F2 — in-memory D1 shim for unit tests.
//
// Not a full SQL engine — just enough to exercise the repo code paths:
//   INSERT / SELECT (equality filters + ORDER BY + LIMIT) / UPDATE / DELETE /
//   COUNT(*) / INSERT OR REPLACE.
//
// Keeps the repo tests hermetic; they don't need @cloudflare/workers-types
// or a running Worker runtime.

import type { D1Like, D1PreparedLike } from "./client.js";

type Row = Record<string, unknown>;

interface Table {
  name: string;
  rows: Row[];
  primaryKey?: string;
}

export interface MemoryD1 extends D1Like {
  _tables: Map<string, Table>;
  _dump: (name: string) => Row[];
  _setPrimaryKey: (table: string, pk: string) => void;
}

export function createMemoryD1(): MemoryD1 {
  const tables = new Map<string, Table>();

  function ensureTable(name: string): Table {
    let t = tables.get(name);
    if (!t) {
      t = { name, rows: [] };
      tables.set(name, t);
    }
    return t;
  }

  function prepare(sql: string): D1PreparedLike {
    const params: unknown[] = [];
    const prep: D1PreparedLike = {
      bind(...values: unknown[]) {
        params.push(...values);
        return prep;
      },
      async first<T = unknown>() {
        const rows = execSelect(sql, params);
        return (rows[0] ?? null) as T | null;
      },
      async all<T = unknown>() {
        const rows = execSelect(sql, params);
        return { results: rows as T[], success: true };
      },
      async run() {
        return exec(sql, params);
      },
    };
    return prep;
  }

  function exec(sql: string, params: unknown[]): { success: boolean } {
    const trimmed = sql.trim();
    if (/^INSERT\b/i.test(trimmed)) {
      return execInsert(trimmed, params);
    }
    if (/^UPDATE\b/i.test(trimmed)) {
      return execUpdate(trimmed, params);
    }
    if (/^DELETE\b/i.test(trimmed)) {
      return execDelete(trimmed, params);
    }
    if (/^SELECT\b/i.test(trimmed)) {
      return { success: true }; // caller should use .first/.all
    }
    throw new Error(`memory-d1: unsupported SQL: ${sql.slice(0, 80)}`);
  }

  function execInsert(sql: string, params: unknown[]): { success: boolean } {
    // Parse: INSERT [OR REPLACE] INTO <table> (col1, col2, ...) VALUES (?,?,?,...)
    const orReplace = /\bINSERT\s+OR\s+REPLACE\b/i.test(sql);
    const match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!match) throw new Error(`memory-d1: couldn't parse INSERT: ${sql}`);
    const tableName = match[1]!;
    const cols = match[2]!.split(",").map((c) => c.trim());
    const table = ensureTable(tableName);
    const row: Row = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]!] = params[i] ?? null;
    }
    if (orReplace && table.primaryKey) {
      const pk = row[table.primaryKey];
      const existing = table.rows.findIndex((r) => r[table.primaryKey!] === pk);
      if (existing >= 0) {
        table.rows[existing] = row;
        return { success: true };
      }
    }
    table.rows.push(row);
    return { success: true };
  }

  function execUpdate(sql: string, params: unknown[]): { success: boolean } {
    // Parse: UPDATE <table> SET col1 = ?, col2 = ?, ... WHERE col = ? [AND col = ?]
    const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/is);
    if (!match) throw new Error(`memory-d1: couldn't parse UPDATE: ${sql}`);
    const tableName = match[1]!;
    const setClause = match[2]!;
    const whereClause = match[3]!;
    const table = ensureTable(tableName);

    // Parse SET fragment. Supports:
    //   col = ?
    //   col = col + 1          (numeric increment)
    //   col = 'literal string'
    //   col = -?123(.456)?     (numeric literal)
    const sets: Array<{ col: string; kind: "param" | "literal" | "inc"; value: unknown }> = [];
    for (const raw of setClause.split(/\s*,\s*(?=[a-zA-Z_][\w]*\s*=)/)) {
      const incMatch = raw.match(/^(\w+)\s*=\s*\1\s*\+\s*1\b/);
      if (incMatch) {
        sets.push({ col: incMatch[1]!, kind: "inc", value: null });
        continue;
      }
      const paramMatch = raw.match(/^(\w+)\s*=\s*\?/);
      if (paramMatch) {
        sets.push({ col: paramMatch[1]!, kind: "param", value: null });
        continue;
      }
      const strLit = raw.match(/^(\w+)\s*=\s*'([^']*)'/);
      if (strLit) {
        sets.push({ col: strLit[1]!, kind: "literal", value: strLit[2]! });
        continue;
      }
      const numLit = raw.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (numLit) {
        sets.push({ col: numLit[1]!, kind: "literal", value: Number(numLit[2]!) });
        continue;
      }
      throw new Error(`memory-d1: unsupported SET: ${raw}`);
    }
    const paramSets = sets.filter((s) => s.kind === "param");
    const whereParts = parseWhere(whereClause);
    const whereParamStart = paramSets.length;

    // Apply ? params to SET fragments in order.
    for (let i = 0; i < paramSets.length; i++) paramSets[i]!.value = params[i];

    const whereBinds = params.slice(whereParamStart);

    const matcher = buildMatcher(whereParts, whereBinds);
    for (const row of table.rows) {
      if (matcher(row)) {
        for (const s of sets) {
          if (s.kind === "param" || s.kind === "literal") {
            row[s.col] = s.value ?? null;
          } else if (s.kind === "inc") {
            row[s.col] = ((row[s.col] as number) ?? 0) + 1;
          }
        }
      }
    }
    return { success: true };
  }

  function execDelete(sql: string, params: unknown[]): { success: boolean } {
    const match = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/is);
    if (!match) throw new Error(`memory-d1: couldn't parse DELETE: ${sql}`);
    const tableName = match[1]!;
    const whereClause = match[2];
    const table = ensureTable(tableName);
    if (!whereClause) {
      table.rows.length = 0;
      return { success: true };
    }
    const whereParts = parseWhere(whereClause);
    const matcher = buildMatcher(whereParts, params);
    table.rows = table.rows.filter((r) => !matcher(r));
    return { success: true };
  }

  function execSelect(sql: string, params: unknown[]): Row[] {
    // Parse: SELECT <cols> FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT ?]
    const match = sql.match(
      /SELECT\s+(?<cols>[\s\S]+?)\s+FROM\s+(?<table>\w+)(?:\s+WHERE\s+(?<where>[\s\S]+?))?(?:\s+ORDER\s+BY\s+(?<orderBy>[\s\S]+?))?(?:\s+LIMIT\s+(?<limit>\?|\d+))?\s*$/is,
    );
    if (!match) throw new Error(`memory-d1: couldn't parse SELECT: ${sql.slice(0, 120)}`);
    const { cols, table: tableName, where, orderBy, limit } = match.groups!;
    const table = ensureTable(tableName!);
    let bindIndex = 0;

    let rows = table.rows.slice();
    if (where) {
      const whereParts = parseWhere(where);
      const whereBinds: unknown[] = [];
      for (const p of whereParts) {
        if (p.kind === "param") whereBinds.push(params[bindIndex++]);
      }
      const matcher = buildMatcher(whereParts, whereBinds);
      rows = rows.filter(matcher);
    }
    if (orderBy) {
      const orderSpec = orderBy.trim();
      // "col DESC" or "col ASC [NULLS FIRST]"
      const parts = orderSpec.split(/\s+/);
      const col = parts[0]!;
      const direction = /DESC/i.test(orderSpec) ? "desc" : "asc";
      const nullsFirst = /NULLS\s+FIRST/i.test(orderSpec);
      rows.sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return nullsFirst ? -1 : 1;
        if (vb == null) return nullsFirst ? 1 : -1;
        if ((va as number | string) < (vb as number | string)) return direction === "asc" ? -1 : 1;
        if ((va as number | string) > (vb as number | string)) return direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    if (limit) {
      const limNum = limit === "?" ? Number(params[bindIndex++] ?? rows.length) : Number(limit);
      rows = rows.slice(0, limNum);
    }
    // Projection — only support "SELECT *" and "SELECT COUNT(*) AS n".
    const colsTrimmed = cols!.trim();
    if (/^COUNT\s*\(\*\)\s+AS\s+n$/i.test(colsTrimmed)) {
      return [{ n: rows.length }];
    }
    return rows;
  }

  interface WherePart {
    col: string;
    op: "=" | "!=" | "IS NULL" | "IS NOT NULL";
    kind: "param" | "null" | "literal";
    literal?: unknown;
    join: "AND" | "OR" | null;
  }
  function parseWhere(clause: string): WherePart[] {
    // Split on AND / OR at the top level, preserving the joiner.
    const rawTokens = clause.split(/\s+(AND|OR)\s+/i);
    const parts: WherePart[] = [];
    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i]!.trim();
      if (/^AND$/i.test(tok) || /^OR$/i.test(tok)) continue;
      let join: "AND" | "OR" | null = null;
      if (i > 0) {
        const prev = rawTokens[i - 1]!.trim();
        if (/^AND$/i.test(prev)) join = "AND";
        else if (/^OR$/i.test(prev)) join = "OR";
      }
      const eqParam = tok.match(/^(\w+)\s*=\s*\?/);
      const neqParam = tok.match(/^(\w+)\s*!=\s*\?/);
      const eqNum = tok.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
      const neqNum = tok.match(/^(\w+)\s*!=\s*(-?\d+(?:\.\d+)?)\s*$/);
      const eqStr = tok.match(/^(\w+)\s*=\s*'([^']*)'\s*$/);
      const neqStr = tok.match(/^(\w+)\s*!=\s*'([^']*)'\s*$/);
      const isNull = tok.match(/^(\w+)\s+IS\s+NULL$/i);
      const notNull = tok.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
      if (eqParam) parts.push({ col: eqParam[1]!, op: "=", kind: "param", join });
      else if (neqParam) parts.push({ col: neqParam[1]!, op: "!=", kind: "param", join });
      else if (eqNum) parts.push({ col: eqNum[1]!, op: "=", kind: "literal", literal: Number(eqNum[2]!), join });
      else if (neqNum) parts.push({ col: neqNum[1]!, op: "!=", kind: "literal", literal: Number(neqNum[2]!), join });
      else if (eqStr) parts.push({ col: eqStr[1]!, op: "=", kind: "literal", literal: eqStr[2]!, join });
      else if (neqStr) parts.push({ col: neqStr[1]!, op: "!=", kind: "literal", literal: neqStr[2]!, join });
      else if (isNull) parts.push({ col: isNull[1]!, op: "IS NULL", kind: "null", join });
      else if (notNull) parts.push({ col: notNull[1]!, op: "IS NOT NULL", kind: "null", join });
      else throw new Error(`memory-d1: unsupported WHERE fragment: ${tok}`);
    }
    return parts;
  }

  function buildMatcher(parts: WherePart[], binds: unknown[]): (row: Row) => boolean {
    // Evaluate left-to-right (simple precedence, good enough for repo queries).
    return (row: Row): boolean => {
      let result = true;
      let bindIdx = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        let cellResult: boolean;
        if (p.op === "IS NULL") cellResult = row[p.col] == null;
        else if (p.op === "IS NOT NULL") cellResult = row[p.col] != null;
        else {
          const expected = p.kind === "literal" ? p.literal : binds[bindIdx++];
          cellResult = p.op === "=" ? row[p.col] === expected : row[p.col] !== expected;
        }
        if (i === 0) result = cellResult;
        else if (p.join === "OR") result = result || cellResult;
        else result = result && cellResult;
      }
      return result;
    };
  }

  const d1: MemoryD1 = {
    _tables: tables,
    _dump: (name: string) => ensureTable(name).rows.slice(),
    _setPrimaryKey: (name: string, pk: string) => {
      ensureTable(name).primaryKey = pk;
    },
    prepare,
  };
  // Pre-set primary keys for tables we test.
  d1._setPrimaryKey("audits", "id");
  d1._setPrimaryKey("preferences", "id");
  d1._setPrimaryKey("watchers", "id");
  d1._setPrimaryKey("interventions", "id");
  d1._setPrimaryKey("welfare_deltas", "audit_id");
  return d1;
}
