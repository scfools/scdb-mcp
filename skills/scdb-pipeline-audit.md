---
name: scdb-pipeline-audit
description: Validate data quality in the remote scdb instance — orphan components, bespoke leaks, count deltas, size mismatches. Use after an import to confirm data integrity.
allowed-tools: Bash, Read, Write
---

# SCDB Pipeline Audit (Remote)

Validate the data currently in the shared scdb instance for integrity. Adapted from the local pipeline-audit skill to work against the live database via MCP tools.

## Step 1: Collect Record Counts

Use `query_table` with `SELECT COUNT(*) FROM <table>` for each data table:

- ships
- components
- ship_hardpoints
- hardpoint_compatibility
- ship_defaults
- manufacturers
- inventory_containers
- ship_cargo

Also read `data_version` to record the current hash and game version being audited.

## Step 2: Check for Orphan Components

Components with no hardpoint compatibility edges are orphaned — they exist but can never appear on any ship.

```sql
SELECT c.entityClassName
FROM components c
WHERE c.entityClassName NOT IN (
  SELECT DISTINCT componentId FROM hardpoint_compatibility
)
```

Report count and first 5 examples. Orphans are a Warning (not an Error) — some components may legitimately have no edges (e.g. paints, dashboards, bespoke items not yet linked).

## Step 3: Check for Bespoke Leaks

Bespoke components (ECN pattern `TYPE_MFR_SIZE_MODEL[_SCItem]`) should only appear on their named ship. A bespoke leak is an edge linking a bespoke component to a non-matching ship.

Use `query_table` to fetch all hardpoint_compatibility rows where the componentId matches the bespoke ECN pattern:

```sql
SELECT hc.id, hc.hardpointId, hc.componentId, hp.shipId
FROM hardpoint_compatibility hc
JOIN ship_hardpoints hp ON hc.hardpointId = hp.id
WHERE hc.componentId LIKE '%_S%_%_%'
```

For each result, parse the ECN model token from `componentId` and verify it matches the `shipId`. Flag any mismatch as a Warning.

Apply known aliases (e.g. `890j` → `890jump`) and skip BESPOKE_IGNORE tokens: `snowblind`, `centurion`, `eclipse`, `nova`, `expedition`, `guardian`, `frontier`, `tempest`, `mercury`, `blizzard`.

## Step 4: Check for Size/Type Mismatches

Component size must fall within the hardpoint's minSize/maxSize range.

```sql
SELECT hc.id, hc.componentId, c.size, hp.minSize, hp.maxSize, hp.shipId
FROM hardpoint_compatibility hc
JOIN components c ON hc.componentId = c.entityClassName
JOIN ship_hardpoints hp ON hc.hardpointId = hp.id
WHERE c.size < hp.minSize OR c.size > hp.maxSize
```

Flag any results as Errors — size mismatches indicate a pipeline bug.

## Step 5: Delta Check Against Previous Version

Use `query_table` on `data_changelog` to compare the current version against the previous one. Check for large swings:

- Edge count change > 10%: Warning
- Ship count decrease (any): Error
- Component count decrease (any): Error
- Ship count increase > 20%: Warning
- Component count increase > 20%: Warning

To get previous-version counts, use `query_table` on `app_sync_cursors` or inspect the `data_changelog` for the previous `versionSeq`.

## Step 6: Compare Local vs Remote (if local data available)

If you have local parsed data (confirmed via `self_inventory`), use `compare_local_remote` to check for any records that exist locally but are missing from scdb, or vice versa. Large discrepancies indicate an incomplete import.

## Step 7: Report Results

Print a summary:

```
SCDB Pipeline Audit — v4.0.0.12345678 (seq 3)
==============================================
Ships:          189
Components:    2340
Hardpoints:    5600
Edges:        45000
Variants:        82
Paints:          310
Dashboards:       45

Errors:   0
Warnings: 2
Info:     1

[WARNING] 15 orphan components (zero edges): COMP_A, COMP_B, ...
[WARNING] Edge count changed +12.3% vs previous (40050 → 45000)
[INFO] 2 bespoke-ignored tokens matched no components (may be stale)
```

## Step 8: Post Audit Results

Use `post_message` to share the audit summary with other collaborators:
- `messageType`: `delta_report`
- `severity`: `breaking` if any Errors, otherwise `info`
- `title`: "Audit: v[gameVersion] — [PASSED/FAILED]"
- `body`: full audit output

If any Errors are found, state clearly: "AUDIT FAILED — N error(s) found. The import should be investigated before other collaborators rely on this data."

If only warnings/info: "AUDIT PASSED with N warning(s)."
