---
name: scdb-onboarding
description: First-run setup for scdb-mcp — discover local project, generate identity, check auth, run self_inventory, post introduction to coordination. Use on first connection to scdb.
allowed-tools: Bash, Read
mcp-servers:
  scdb:
    command: npx
    args: ["@scfools/scdb-mcp"]
---

# SCDB Onboarding

First-time setup for connecting to the shared scdb instance.

## Steps

1. **Check connection**: Run the `sync_status` tool to verify connectivity to scdb
2. **Check auth**: If the tool reports you are not authorized, share your identity hex string with an existing collaborator and ask them to run `authorize_publisher`
3. **Run inventory**: Use `self_inventory` to discover what local data and pipeline scripts exist
4. **Post introduction**: Use `post_message` with type `delta_report` to share your inventory with other collaborators:
   - sourceApp: your project name (e.g. "versedb")
   - severity: "info"
   - title: "New collaborator onboarding — [project name]"
   - body: paste the self_inventory output
5. **Check existing state**: Use `check_coordination` to see any pending messages or decisions
6. **Review formulas**: Use `formula_lookup` to see what shared formulas exist
