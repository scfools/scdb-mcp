---
name: scdb-schema-reference
description: SCDB table definitions, field semantics, reducer signatures, query examples. Reference for working with the shared SpacetimeDB instance.
allowed-tools: Read
---

# SCDB Schema Reference

## Data Tables

| Table | PK | Key Fields | Purpose |
|-------|-----|-----------|---------|
| manufacturers | ref | code, name, ecnCode | Ship/component manufacturers |
| ships | id | displayName, subType, size, manufacturer | Ship entities |
| components | entityClassName | type, subType, size, grade, manufacturer | Component entities |
| ship_hardpoints | id (shipId::name) | shipId, minSize, maxSize, types | Hardpoint slots on ships |
| hardpoint_compatibility | id (hpId::compId) | hardpointId, componentId | Which components fit which hardpoints |
| ship_defaults | id (shipId::hpName) | shipId, hardpointName, defaultComponentId | Factory-default loadouts |
| inventory_containers | id | containerType, x, y, z, scu | Cargo container dimensions |
| ship_cargo | id | shipId, containerId | Ship-to-container mappings |

## Versioning Tables

| Table | PK | Purpose |
|-------|-----|---------|
| data_version | id (always 0) | Current hash, gameVersion, versionSeq |
| data_changelog | uuid | Per-record change log (insert/update/delete) |
| app_sync_cursors | appId | Per-app last synced version |

## Coordination Tables

| Table | PK | Purpose |
|-------|-----|---------|
| coordination_messages | uuid | Async Claude-to-Claude messages |
| coordination_state | id | Current phase, agreed/pending items |
| formulas | id | Shared calculation formulas |
| formula_changelog | uuid | Formula change history |
| skill_versions | skillName | Content hash per skill for sync checking |
| authorized_publishers | identity (hex) | Who can write to scdb |

## Query Examples

```sql
-- All ships of size Medium
SELECT * FROM ships WHERE size = 'Medium'

-- Components by type
SELECT * FROM components WHERE type = 'WeaponGun'

-- Hardpoints for a specific ship
SELECT * FROM ship_hardpoints WHERE ship_id = 'AEGS_Gladius'

-- Pending coordination messages
SELECT * FROM coordination_messages WHERE status != 'resolved' AND status != 'rejected' AND status != 'closed'
```

## MCP Tools Quick Reference

| Tool | Auth Required | Purpose |
|------|--------------|---------|
| `query_table` | No | One-shot read with optional WHERE clause |
| `formula_lookup` | No | Query formulas by name, domain, or list all |
| `sync_status` | No | Data version, per-app cursors, drift warnings |
| `self_inventory` | No | Local project paths, scripts, data counts |
| `compare_local_remote` | No | Diff local JSON vs scdb per table |
| `check_coordination` | No | Pending/active coordination messages |
| `get_thread` | No | Full conversation chain by parentId |
| `import_to_scdb` | Yes | Push pre-parsed JSON to scdb |
| `post_message` | Yes | Send coordination message |
| `authorize_publisher` | Yes | Add new collaborator identity |

## Coordination Message Types

Valid `messageType` values: `delta_report`, `schema_proposal`, `pipeline_change`, `formula_proposal`, `skill_update`, `sign_off`, `general`

Valid `severity` values: `info`, `breaking`

Terminal statuses (message closed): `resolved`, `rejected`, `closed`
