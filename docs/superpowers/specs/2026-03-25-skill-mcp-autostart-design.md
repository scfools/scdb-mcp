# Skill MCP Server Auto-Configuration

## Problem

Skills reference MCP tools (e.g. `sync_status`, `query_table`) but nothing ensures the MCP server providing those tools is actually configured when a skill is invoked. Users must manually set up `.mcp.json` before skills work.

## Solution

Two changes:

1. **Skill frontmatter declares MCP server dependencies** via an `mcp-servers` field
2. **`install-skills` CLI merges declared servers into `.mcp.json`** so the server is configured automatically

## Frontmatter Format

```yaml
---
name: scdb-import
description: ...
allowed-tools: Bash, Read
mcp-servers:
  scdb:
    command: npx
    args: ["@scfools/scdb-mcp"]
---
```

The `mcp-servers` field is a map of server name to config object. The config object matches the shape used in `.mcp.json` (`command`, `args`, optionally `env`).

## install-skills Behavior

When `npx @scfools/scdb-mcp install-skills` runs:

1. Copy skills to `.claude/skills/` (existing behavior)
2. Scan each installed SKILL.md for `mcp-servers` in frontmatter
3. Read `.mcp.json` from project root (create `{ "mcpServers": {} }` if missing)
4. For each declared server: if the server name is not already in `mcpServers`, add it using the provided config
5. Write `.mcp.json` back
6. Log what servers were added (or that all were already configured)

## Design Decisions

- **Never overwrite existing configs** — if a server name already exists in `.mcp.json`, skip it. Users may have custom env vars, URIs, or other overrides.
- **Lightweight frontmatter parsing** — regex to extract YAML between `---` fences, then parse the `mcp-servers` block with simple line-based parsing. No YAML library dependency.
- **Merge across skills** — if multiple skills declare the same server, first one encountered wins (all skills in this package declare the same `scdb` server).

## Files Changed

- `skills/*/SKILL.md` (all 7) — add `mcp-servers` frontmatter field
- `src/cli.ts` — update `runInstallSkills()` to parse frontmatter and merge into `.mcp.json`
- `test/` — tests for frontmatter parsing and `.mcp.json` merging
