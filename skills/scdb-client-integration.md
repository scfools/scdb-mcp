---
name: scdb-client-integration
description: Wire a web app to consume data from scdb — TypeScript bindings, subscriptions, sync cursors, IndexedDB hydration. Use when building or updating a client that reads from the shared scdb instance.
allowed-tools: Bash, Read, Write
---

# SCDB Client Integration

Connect a web application to consume game data from scdb using the TypeScript SDK and sync cursors for incremental updates.

## Prerequisites

- TypeScript bindings must be up to date: `npx @sc-fools/scdb-mcp update`
- Bindings are in the `bindings/` directory of the scdb-mcp package
- Check `bindings/.bindings-version` to confirm bindings match the live schema

## Connection Setup

Import the generated bindings and connect using the SDK:

```typescript
import { SpacetimeDBClient } from '@clockworklabs/spacetimedb-sdk';
import * as generated from '@sc-fools/scdb-mcp/bindings';

const client = new SpacetimeDBClient(
  'https://maincloud.spacetimedb.com',
  'scdb',
  generated
);

// Persist identity across sessions
const stored = localStorage.getItem('scdb_token');
if (stored) client.withToken(stored);

client.onConnect((token) => {
  localStorage.setItem('scdb_token', token);
});
```

## Data Version Check

Before loading data, check the current version against your stored version:

```typescript
client.subscribe(['SELECT * FROM data_version']);

client.on('data_version', (rows) => {
  const remote = rows[0];
  const local = await db.get('meta', 'data_version');
  if (!local || local.hash !== remote.hash) {
    // Data is stale — fetch and hydrate
  }
});
```

## Incremental Sync via data_changelog

Instead of re-fetching all tables, use `data_changelog` to fetch only what changed since the last sync:

```typescript
const cursor = await db.get('meta', 'sync_cursor') ?? { versionSeq: 0 };

client.subscribe([
  `SELECT * FROM data_changelog WHERE version_seq > ${cursor.versionSeq}`
]);

client.on('data_changelog', async (entries) => {
  for (const entry of entries) {
    if (entry.operation === 'delete') {
      await db.delete(entry.tableName, entry.recordId);
    } else {
      await db.put(entry.tableName, JSON.parse(entry.payload));
    }
  }
  await db.put('meta', { key: 'sync_cursor', versionSeq: latestSeq });
});
```

## Sync Cursor Registration

After syncing, update the `app_sync_cursors` table so the server knows your app is current. This is a write operation and requires an authorized publisher identity — for read-only clients, skip this step.

## Full Hydration (First Load)

On first load or after a cache miss, subscribe to all data tables:

```typescript
const tables = [
  'ships', 'components', 'ship_hardpoints', 'hardpoint_compatibility',
  'ship_defaults', 'manufacturers', 'inventory_containers', 'ship_cargo'
];

client.subscribe(tables.map(t => `SELECT * FROM ${t}`));

for (const table of tables) {
  client.on(table, async (rows) => {
    await db.transaction('readwrite', [table], () => {
      for (const row of rows) db.put(table, row);
    });
  });
}
```

## IndexedDB Schema

Each data table maps to an IndexedDB object store keyed by its primary key:

| Store | Key Path | Notes |
|-------|----------|-------|
| ships | id | |
| components | entityClassName | |
| ship_hardpoints | id | Composite: shipId::name |
| hardpoint_compatibility | id | Composite: hpId::compId |
| ship_defaults | id | Composite: shipId::hpName |
| manufacturers | ref | |
| inventory_containers | id | |
| ship_cargo | id | |
| meta | key | version, cursor, loading state |

## Loading State

Show a loading indicator until all subscribed tables have received their initial row set. Track per-table readiness and only render the UI when all tables are populated.

## Staying Current During a Session

Subscribe to `data_version` throughout the session. When the hash changes, prompt the user to refresh or silently apply the delta via `data_changelog` depending on the app's UX requirements.

## Verifying Integration

Use the `query_table` MCP tool to spot-check that records in scdb match what your app is displaying. Use `sync_status` to confirm your app's cursor is registered and current.
