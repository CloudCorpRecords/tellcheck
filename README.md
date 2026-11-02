# tellcheck

Check a piece of writing against a voice style, and scan it for the
tells that make prose read as machine-generated. Everything runs
locally and deterministically: no network, no API key, no model calls.
State (styles, dictionaries, instructions, default style) persists as
JSON under `TELLCHECK_HOME` or `~/.tellcheck`.

This is a clean-room rebuild of the etincel writing-style tool,
implemented from its public README tool spec. Schemas are documented
reconstructions from that prose.

## What it does

- **Styles.** Twelve shipped presets (Direct & Warm, Executive Brief,
  Reflective Essayist, Founder Memo, Plainspoken Analyst, Wry & Candid,
  PR Review, Code Comment, Slack Message, LinkedIn Post, Website Copy,
  Blog Post), each with formality / warmth / directness dials and a
  rhythm description. Train your own style from samples, create one
  directly from dials, fork, update, delete, and set a default.
- **Voice match.** Compare a draft's rhythm and mechanics (sentence
  length and variance, contraction rate, em-dash use, fragments,
  questions) against a style baseline. Short input gets an honest
  low-confidence note instead of a false-precision score.
- **Self-repetition.** Repeated sentence openers and phrases, including
  repetition against a trained style's own samples.
- **AI-tell audit.** A deterministic scan: a built-in tell vocabulary
  with a suggested replacement for each hit (for example
  "comprehensive", "cutting-edge", "leverage", "seamless",
  "streamline"), rhythm findings (uniform paragraph length, low
  burstiness), and strengths (specificity, concrete-to-abstract
  balance). Returns a tier — green, yellow, orange, or red — plus a
  0–100 score and findings with locations. Registers: `email`, `blog`,
  `memo`, `essay`, `social`, `docs`, `general`, `personal`; the `docs`
  register suppresses markdown-structure findings. Supplying
  `sourceFacts` flags numbers in the text that the facts do not back.
- **Dictionaries and instructions.** Global and per-style banned-word
  and custom-word lists, plus free-form style instructions.
- **second_read, honestly.** In the original, the local install's
  second read always fails with a clear explanation (the feature needs
  a hosted model). This rebuild reproduces exactly that behaviour
  rather than faking a result.

## CLI

One subcommand per tool, taking a single JSON argument object:

```bash
npx @reneturcios/tellcheck list_styles '{}'
npx @reneturcios/tellcheck get_style_guide '{"styleId":"founder-memo"}'
npx @reneturcios/tellcheck train_style '{"name":"My Voice","samples":["..."]}'
npx @reneturcios/tellcheck audit_text '{"text":"...","register":"blog"}'
npx @reneturcios/tellcheck --version
```

Exit codes: 0 success, 1 tool error, 2 usage error.

## MCP

```bash
npx -y @reneturcios/tellcheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "tellcheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/tellcheck", "mcp"]
    }
  }
}
```

### Tools (20)

| Tool | Purpose |
|---|---|
| `list_styles` | Presets, trained styles, and the team style if defined |
| `get_style_guide` | Full guide for one style |
| `train_style` | Train a style from samples (rhythm, contractions, em dashes, paragraph variance) |
| `create_style_from_dials` | Create a style from the eleven voice dials |
| `update_style` | Rename a style or adjust its dials |
| `fork_style` | Fork a local style (public-gallery forks return an honest error) |
| `delete_style` | Delete a user-created style |
| `set_default_style` | Set the default style |
| `check_voice_match` | Rhythm/mechanics comparison against a style baseline |
| `check_self_repetition` | Repeated openers/phrases, including vs training samples |
| `audit_text` | Deterministic AI-tell scan with tier, score, and located findings |
| `second_read` | Always fails locally, with the original's clear explanation |
| `add_banned_word` / `remove_banned_word` | Manage banned words (global or per style) |
| `add_custom_word` / `remove_custom_word` | Manage custom dictionary words |
| `list_dictionary` | Dictionary scopes plus the merged effective list for a style |
| `set_style_instructions` / `clear_style_instructions` / `get_style_instructions` | Free-form style instructions |

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/tellcheck          # stdio MCP server
docker run --rm ghcr.io/cloudcorprecords/tellcheck list_styles '{}'
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (temp TELLCHECK_HOME, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
