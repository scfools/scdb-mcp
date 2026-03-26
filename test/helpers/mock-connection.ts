import { vi } from 'vitest';

/**
 * Mock setup for HTTP-based STDB client.
 * Tools now use sqlQuery() and callReducer() instead of DbConnection subscriptions.
 */

/** Track reducer calls made via callReducer. */
export interface ReducerCall {
  name: string;
  args: unknown[];
}

const reducerCalls: ReducerCall[] = [];
let tableData: Record<string, Record<string, unknown>[]> = {};

/** Configure mock table data (keyed by snake_case table name). */
export function setMockTableData(data: Record<string, Record<string, unknown>[]>): void {
  tableData = data;
}

/** Get all reducer calls made during the test. */
export function getReducerCalls(): ReducerCall[] {
  return reducerCalls;
}

/** Clear state between tests. */
export function resetMocks(): void {
  reducerCalls.length = 0;
  tableData = {};
}

/** Mock sqlQuery: extracts table name from SQL and returns matching mock data. */
export async function mockSqlQuery(query: string): Promise<Record<string, unknown>[]> {
  const match = query.match(/FROM\s+(\w+)/i);
  const tableName = match?.[1] ?? '';
  return tableData[tableName] ?? [];
}

/** Mock callReducer: records the call for assertions. */
export async function mockCallReducer(name: string, args: unknown[]): Promise<void> {
  reducerCalls.push({ name, args });
}
