---
name: scdb-formula-management
description: Propose, update, and verify shared scdb formulas through the coordination protocol. Use when adding new calculations, changing existing ones, or verifying formula accuracy.
allowed-tools: Bash, Read
mcp-servers:
  scdb:
    command: npx
    args: ["@scfools/scdb-mcp"]
---

# SCDB Formula Management

Shared formulas live in the `formulas` table and are accessible to all collaborators. Changes require coordination to avoid conflicts.

## Inspect Existing Formulas

1. Use `formula_lookup` with no arguments to list all formulas
2. Use `formula_lookup` with a name or domain to filter (e.g. `domain: "shields"`, `name: "shield_regen"`)
3. Each formula includes: `expression`, `variables`, `implementation` (reference code), and `verified` flag

## Propose a New Formula

1. **Check for conflicts**: Use `formula_lookup` to verify no existing formula covers the same calculation
2. **Draft the proposal**: Prepare the formula fields:
   - `name`: unique snake_case identifier (e.g. `shield_regen_rate`)
   - `domain`: category (e.g. `shields`, `weapons`, `power`, `cooling`, `engines`)
   - `expression`: human-readable math (e.g. `maxHealth * regenRate / rechargeTime`)
   - `variables`: list of variable names and their sources (which ship/component fields)
   - `implementation`: reference TypeScript/Python snippet
3. **Post for review**: Use `post_message`:
   - `messageType`: `formula_proposal`
   - `severity`: `info` (or `breaking` if it changes existing behavior)
   - `title`: "Proposal: [formula name]"
   - `body`: full formula definition + rationale + any test values
4. **Wait for sign-off**: The other collaborator should respond with a `sign_off` message or raise concerns

## Update an Existing Formula

1. **Check current state**: Use `formula_lookup` to get the current formula definition
2. **Post change notice**: Use `post_message` with `messageType: "formula_proposal"` and `parentId` of the original proposal thread if one exists
   - If the change is breaking (alters outputs), use `severity: "breaking"`
   - Include before/after expression and reason for change
3. **Await sign-off** before updating the formula in any import or pipeline script

## Verify a Formula

1. Use `query_table` on the `formulas` table to read the current `verified` field
2. Cross-check the expression against known reference values (erkul.games or spviewer.eu can be used as reference — do not store their data, only use for comparison)
3. If verified, post a `sign_off` message confirming the formula with test values used
4. If discrepancy found, post a `formula_proposal` with `severity: "breaking"` detailing the issue

## Formula Change History

Use `query_table` on the `formula_changelog` table to see the full history of changes to any formula, including who changed it and when.
