---
name: scdb-coordination
description: Session-start protocol for scdb — check pending coordination messages, review and respond, escalate breaking changes to human. Use at the start of each session.
allowed-tools: Bash, Read
---

# SCDB Coordination Protocol

Run this at the start of each Claude Code session when working on scdb-related tasks.

## Steps

1. **Check messages**: Run `check_coordination` to see pending/active messages
2. **Review each message**:
   - `info` severity: read and acknowledge, adapt your work accordingly
   - `breaking` severity: surface to the user for approval before proceeding
3. **Respond to threads**: If a message requires a response, use `post_message` with the original message's ID as `parentId`
4. **Check sync**: Run `sync_status` to see if data or skills have changed since your last session
5. **Report findings**: Summarize any coordination activity to the user
