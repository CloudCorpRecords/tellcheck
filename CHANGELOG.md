# Changelog

## 0.1.0 (2026-10-26)

- Initial rebuild: 20 MCP tools covering voice styles (12 shipped
  presets, training from samples, dial-based creation, fork / update /
  delete / default), voice-match and self-repetition checks, a
  deterministic AI-tell audit with tier and score, banned/custom
  dictionaries, and style instructions.
- Fully local and deterministic; state persists as JSON under
  `TELLCHECK_HOME` or `~/.tellcheck`. No network, no API key.
- `second_read` reproduces the original local install's honest
  always-fails behaviour with a clear explanation; public-gallery
  forks in `fork_style` return an honest error offline.
- One bin serves the CLI (one subcommand per tool, JSON argument) and
  the stdio MCP server (`mcp` subcommand).
