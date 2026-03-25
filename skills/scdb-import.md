---
name: scdb-import
description: Import pre-parsed game data into scdb — preview diff, run import, verify results. Use after running the local pipeline to push updated data to the shared instance.
allowed-tools: Bash, Read, Write
---

# SCDB Import

Push locally parsed game data to the shared scdb instance. Always preview before importing.

## Prerequisites

- You must be an authorized publisher (check via `sync_status`)
- Local pipeline must have run successfully — parsed JSON should exist in the auto-discovered data directory
- Run the `scdb-coordination` skill first to check for any pending breaking changes that might affect import

## Step 1: Verify Local Data

Use `self_inventory` to confirm the parsed data directory was found and review record counts per table:

```
Tables found: ships (189), components (2340), hardpoints (5600), ...
Game version: 4.0.0.12345678
```

If the data directory is not found, set `SCDB_DATA_DIR` to the absolute path of your parsed STDB JSON directory.

## Step 2: Preview the Diff

Use `compare_local_remote` to diff your local data against the current scdb contents. Review:

- **Added**: records present locally but not in scdb
- **Removed**: records in scdb that are absent locally (deletions)
- **Changed**: records with differing field values

If removals are large (>10% of total), investigate before proceeding — this may indicate a pipeline regression.

## Step 3: Post a Delta Report

Before importing, post a coordination message so the other collaborator is aware:

Use `post_message`:
- `messageType`: `delta_report`
- `severity`: `info` (or `breaking` if there are schema changes or large removals)
- `title`: "Import: [game version] — [brief summary of changes]"
- `body`: paste the compare_local_remote output

## Step 4: Import

Use `import_to_scdb` to push the data. The tool will:

1. Read JSON files from the discovered data directory
2. Compute a SHA-256 hash of the full dataset
3. Call import reducers with sequential versioning
4. Report per-table record counts and changelog size

A typical successful output:

```
Import complete — v4.0.0.12345678 (seq 3)
  ships:                189 records
  components:          2340 records
  ship_hardpoints:     5600 records
  hardpoint_compat:   45000 records
  ship_variants:         82 records
  paint_mappings:       310 records
  dashboard_mappings:    45 records
  manufacturers:         28 records
  changelog entries:   1240
```

## Step 5: Verify

Use `sync_status` to confirm the new version is live:

- `dataVersion.gameVersion` matches the version you imported
- `dataVersion.versionSeq` incremented
- `dataVersion.hash` matches the hash reported by the import

Use `query_table` with spot-check queries to verify specific records landed correctly (e.g. a known ship, a known component).

## Handling Import Failures

- **Not authorized**: Share your hex identity with an existing collaborator and ask them to run `authorize_publisher`
- **Data directory not found**: Set `SCDB_DATA_DIR` env var to the absolute path
- **Hash mismatch after import**: Re-run `compare_local_remote` to check for any remaining discrepancies
- **Reducer errors**: Check the `data_changelog` table for partial writes, then investigate the specific records that failed
