---
name: scdb-import
description: Import pre-parsed game data into scdb — preview diff, run import, verify results. Use after running the local pipeline to push updated data to the shared instance.
allowed-tools: Bash, Read
---

# SCDB Import

Push locally parsed game data to the shared scdb instance. Always preview before importing.

For table definitions and field semantics, invoke `/scdb-schema-reference`.

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

## Step 2: Understand What's New Locally

Before comparing, read the local data to understand what your pipeline produced and why it differs from what's currently in scdb:

1. **Check pipeline changes**: Read recent git log for the pipeline scripts (`parse_vehicles.py`, `export_for_stdb.py`, `build_relationships.py`, etc.) to identify what was added or modified since last import
2. **Scan new/changed fields**: Sample a few local records (ships, components) and compare their field set against the schema reference — identify any new fields your pipeline now populates that weren't there before
3. **Check enrichment sources**: If your pipeline added data from new sources (DCB binary reads, external APIs, community data), note what those sources are and which tables/fields they affect
4. **Note known gaps**: Identify fields your pipeline does NOT populate (defaults to 0/empty) that another collaborator may own — these should not overwrite their data

## Step 2b: Preview the Diff

Use `compare_local_remote` to diff your local data against the current scdb contents. Review:

- **Added**: records present locally but not in scdb
- **Removed**: records in scdb that are absent locally (deletions)
- **Changed**: records with differing field values

If removals are large (>10% of total), investigate before proceeding — this may indicate a pipeline regression.

## Step 3: Describe the Delta

Before importing, investigate what actually changed — don't just report counts. For each table with diffs:

### Additions
If records were added, summarize what's new: "12 new ships from 4.1 patch (3 variants, 9 new hulls)" not just "added: 12".

### Removals
If records were removed, explain why: "6 EA training ships filtered out" or "deprecated _gs duplicates pruned". Large unexplained removals (>10% of total) may indicate a pipeline regression — investigate before proceeding.

### Changes
For changed records, sample 2-3 using `query_table` to compare against local data. Identify which fields differ and categorize the changes:
- **Schema enrichment**: new columns populated (e.g. "VerseDB populated flight data on 163 ships")
- **Value corrections**: existing fields updated (e.g. "cargo capacity recalculated for 5 ships after container fix")
- **Type normalization**: formatting differences (e.g. "string booleans coerced to numbers") — note these as cosmetic, not data changes
- **Cross-pipeline overlap**: fields both pipelines write with different values — flag for naming/priority resolution

### Post the delta report

Use `post_message`:
- `messageType`: `delta_report`
- `severity`: `info` (or `breaking` if there are schema changes, large removals, or value conflicts)
- `title`: "Import: [game version] — [brief summary of changes]"
- `body`: include the compare counts AND the narrative description of what changed and why

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
