import { vi } from 'vitest';

/**
 * Creates a mock DbConnection-like object for tool tests.
 * Tools interact with the connection through subscriptions and reducers.
 */
export function createMockConnection(tableData: Record<string, any[]> = {}) {
  const reducerCalls: { name: string; args: any }[] = [];

  const mockConn = {
    subscriptionBuilder: () => ({
      onApplied: (cb: Function) => ({
        subscribe: (query: string) => {
          // Extract table name from "SELECT * FROM table_name"
          const match = query.match(/FROM\s+(\w+)/i);
          const tableName = match?.[1] ?? '';
          // Find camelCase accessor name for this snake_case table
          const camelName = tableName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
          const rows = tableData[camelName] ?? tableData[tableName] ?? [];

          const mockCtx = {
            db: new Proxy({}, {
              get: (_target, prop: string) => ({
                iter: () => rows[Symbol.iterator](),
                // PK accessor pattern
                find: (key: any) => rows.find((r: any) => Object.values(r)[0] === key),
              }),
            }),
          };

          // Simulate async subscription callback
          Promise.resolve().then(() => cb(mockCtx));
        },
      }),
    }),
    reducers: new Proxy({}, {
      get: (_target, prop: string) => {
        return (args: any) => {
          reducerCalls.push({ name: prop, args });
        };
      },
    }),
    disconnect: vi.fn(),
  };

  return { conn: mockConn as any, reducerCalls };
}
