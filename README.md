# @scfools/scdb-mcp

MCP server for interacting with the shared Star Citizen data SpacetimeDB instance.

## Quick Start

### 1. Install skills

```bash
npx @scfools/scdb-mcp install-skills
```

### 2. Add to Claude Code MCP config

```json
{
  "mcpServers": {
    "scdb": {
      "command": "npx",
      "args": ["@scfools/scdb-mcp"]
    }
  }
}
```

### 3. Onboard

Claude will run the `scdb-onboarding` skill on first use. Share your identity hex with an existing collaborator to get authorized.

## Tools

| Tool | Purpose | Auth Required |
|------|---------|--------------|
| query_table | Read data from scdb | No |
| formula_lookup | Query shared formulas | No |
| sync_status | Check data version and drift warnings | No |
| self_inventory | Report local project state | No |
| compare_local_remote | Diff local data vs scdb | No |
| check_coordination | View pending messages | No |
| import_to_scdb | Push parsed data to scdb | Yes |
| post_message | Send coordination messages | Yes |
| get_thread | Follow message threads | No |
| authorize_publisher | Add new collaborator | Yes |

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCDB_URI` | `https://maincloud.spacetimedb.com` | SpacetimeDB server |
| `SCDB_MODULE` | `scdb` | Module name |
| `SCDB_TOKEN_DIR` | `~/.config/scdb-mcp` | Token storage directory |
| `SCDB_DATA_DIR` | auto-discovered | Parsed STDB JSON directory |
| `P4K_DIR` | auto-discovered | P4K archive directory |
| `SCDB_PIPELINE_DIR` | auto-discovered | Pipeline scripts directory |
