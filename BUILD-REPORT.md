# tellcheck — Build Report

Tranche Batch 3, MCP Rebuild 100. Clean-room rebuild of
AIStoryHub/etincel (rank 91, 9 stars), built from the public README
tool spec only. Local build only — nothing pushed or published.

Identity: repo `tellcheck`, npm `@reneturcios/tellcheck`,
MCP name `io.github.CloudCorpRecords/tellcheck`, version `0.1.0`.
Fully local and deterministic: no network, no API key. State persists
as JSON under `TELLCHECK_HOME` or `~/.tellcheck` (styles,
dictionaries, instructions, default style).

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `tellcheck: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Voice-style checks and a deterministic
  AI-tell audit for your writing." = **70 chars** (≤100 ✓); npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/tellcheck:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/tellcheck"`
- `tsconfig.json` (318 bytes, fleet-identical), `.gitignore`,
  `package-lock.json` (see Lockfile), `LICENSE` (MIT, Copyright (c)
  2026 Rene Turcios), `README.md` (fresh text), `CHANGELOG.md`
  (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (one subcommand per tool taking a JSON
  argument object, plus `mcp` and `--version`; unknown command exits
  2, tool errors exit 1), `src/mcp.ts`, `src/types.ts`,
  `src/tellcheck.ts` (core, `VERSION = "0.1.0"`)
- `test/tellcheck.test.ts` — temp `TELLCHECK_HOME` dirs, no network
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (adapted from shipcheck; image name and smoke-test server name
  changed to tellcheck)

## Implementation notes

- All 20 spec tools implemented: `list_styles` (12 shipped presets,
  each with formality/warmth/directness dials + rhythm description;
  trained styles and a team style slot included), `get_style_guide`,
  `train_style` (measures sentence rhythm, contraction rate, em-dash
  use, paragraph variance from samples; persists), 
  `create_style_from_dials` (all 11 dials), `update_style`,
  `fork_style`, `delete_style`, `set_default_style`,
  `check_voice_match` (rhythm/mechanics comparison vs baseline,
  low-confidence note under 50 words / 3 sentences),
  `check_self_repetition` (repeated openers/phrases, including vs
  training samples), `audit_text`, `second_read`,
  `add_banned_word` / `remove_banned_word` / `add_custom_word` /
  `remove_custom_word`, `list_dictionary` (per-scope lists plus the
  merged effective list for a style), `set_style_instructions` /
  `clear_style_instructions` / `get_style_instructions`.
- `audit_text` is a deterministic scan with an original tell corpus
  written for this rebuild (35 entries with replacements, including
  the README's examples: comprehensive, cutting-edge, leverage,
  seamless, streamline), rhythm findings
  (uniform-paragraph-length, low-burstiness), banned-word findings,
  number-vs-`sourceFacts` findings, and strengths (specificity
  anchors, concrete:abstract ratio). Returns tier
  green/yellow/orange/red + 0–100 score + findings with locations.
  Registers: email/blog/memo/essay/social/docs/general/personal;
  `docs` suppresses markdown-structure findings (tested).
- `src/mcp.ts` uses the SDK low-level `Server` with explicit
  `inputSchema` literals (not McpServer+zod): the high-level helper
  injects `$schema` / `additionalProperties` keys absent from the
  spec, which breaks exact parity. Zod still validates every
  `tools/call` argument set.
- Presets cannot be edited or deleted in place; the error tells the
  caller to fork first. Dictionary/instruction edits on a preset are
  likewise refused.

## Gaps (honest)

- **fork_style gallery forks:** forking a local style id or preset
  works fully offline. A public-gallery handle/slug source (anything
  containing `/`, starting with `@`, or `gallery:`) returns an honest
  error explaining the hosted gallery is unavailable in this local
  rebuild — no fake fork is created.
- **second_read:** reproduces the original local install's behaviour
  exactly — it always fails, with a clear explanation that the second
  read needs a hosted model the local package does not ship, pointing
  at `audit_text` / `check_voice_match` as the local checks. Verified
  via unit test and CLI (exit 1 with the explanation).
- **Schemas are docs-derived:** the fixture
  `harness/fixtures/etincel-tools-original.json` is labelled
  `_source: docs-derived` — schemas are documented reconstructions
  from the README prose, not captured wire schemas.
- Behaviour parity beyond the tool surface (exact original scoring
  weights, original tell corpus) is unknowable from the README; the
  audit corpus and scoring here are original, deterministic, and
  covered by tests.

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced (cli.js, tellcheck.js, mcp.js, index.js, types.js
plus .d.ts/.js.map).

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Covers: 12 presets, 20 tool names, training baseline measurement and
persistence across store instances, dial create/update/fork/delete/
default round-trip, preset edit/delete refusals, gallery-fork honest
error, voice-match low-confidence note, self-repetition vs training
samples, tell-vocabulary findings with replacements, green-tier clean
text, docs-register markdown suppression, unverified-number findings,
second_read honest failure, dictionary merge/remove, banned words in
audit, instructions set/get/clear at both scopes, and a dispatcher
sweep over all 20 tool names. (One real failure was caught and fixed
during the run: `delete_style` returned `{deleted}` instead of
`{id}`; core fixed and the suite re-run green.)

### 3. MCP / CLI smoke
- initialize -> `serverInfo: {"name":"tellcheck","version":"0.1.0"}`;
  tools/list -> exactly 20 tools.
- CLI: `--version` -> `0.1.0`; `list_styles '{}'` returns the presets;
  `audit_text` on a tell-heavy sentence returned tier `yellow`,
  score 82, with located findings and replacements; `second_read`
  exits 1 with the honest explanation; unknown command exits 2 with
  Usage.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
Fixture created firsthand at
`fixtures/etincel-tools-original.json` (20 tools, docs-derived):
```
$ python3 parity.py --original fixtures/etincel-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/tellcheck/dist/cli.js mcp" \
    --out /home/hatch/workspace/mcp-rebuild-100/builds/tellcheck/parity-out
verdict=PASS parity_pct=100.0 original_tools=20 rebuild_tools=20 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Report in `parity-out/parity.json` + `parity-out/parity.md`
(fixture_results: SKIPPED-TOOLS-FILE-MODE, as expected).

## Lockfile status

**Clean lockfile (Route 3), verified.** `package.json` alone was
copied into a fresh `/tmp/tellcheck-lock/` (no `node_modules` there)
and `npm install --package-lock-only --ignore-scripts --offline`
produced a `package-lock.json` that parses, has
`name == "@reneturcios/tellcheck"`, lockfileVersion 3, and 128
package entries; that verified file was placed in the build dir.
`node_modules` in the build dir is a `cp -a` copy from a sibling
build (clockport; local build/test only, gitignored).

## Blockers

None for the local build. Not pushed, not published, no GitHub repo
created (per task rules). Container build not exercised locally; the
publish-container workflow smoke-tests the image at publish time.
