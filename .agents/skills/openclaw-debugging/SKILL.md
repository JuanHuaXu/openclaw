---
name: openclaw-debugging
description: Debug OpenClaw model, provider, tool-surface, code-mode, streaming, and live/Crabbox behavior by choosing the right logs, probes, and proof path before changing code.
---

# OpenClaw Debugging

Use this skill when OpenClaw behavior differs between local tests, live models,
providers, code mode, Tool Search, Crabbox, or CI, and the next move should be a
debug signal rather than a guess.

## Read First

- `docs/logging.md` for log files, `openclaw logs`, and targeted debug flags.
- `docs/reference/test.md` for local test commands.
- `docs/reference/code-mode.md` for code-mode exec/wait and tool catalog rules.
- Use `$openclaw-testing` for choosing test lanes.
- Use `$crabbox` for broad, Docker, package, Linux, live-key, or CI-parity proof.

## Default Loop

1. State the suspected boundary: config, tool construction, provider payload,
   fetch, stream/SSE, transcript replay, worker/runtime, package/dist, or CI.
2. Add or enable the narrowest signal that proves that boundary.
3. Reproduce with the same provider/model/config. Do not randomly switch models
   unless the model itself is the variable being tested.
4. Compare configured state with actual run activation.
5. Patch the root cause.
6. Rerun the exact failing probe, then broaden only if the contract requires it.

## Tool Loop / Halt Hunts

Use this when an agent repeats a tool call, says it will act then stops, loses a
post-tool answer, or loops only when specific plugins are loaded.

1. Treat `looped`, `poisoned session`, and `loop detector fired` as symptoms.
   Find the upstream transition that made the next model turn believe another
   tool call was needed.
2. Capture the full turn boundary: provider-visible prompt/messages/tools,
   model output, tool request, tool result, replayed context, and final sink
   output. A stored session row or memory hit is not proof the model saw it.
3. Classify lifecycle phase before patching: live current-turn tool protocol,
   historical replay, recalled memory, user-card note, tool result, and channel
   delivery are separate phases even when their text looks similar.
4. Build a control matrix:
   - vanilla OpenClaw + same model + no plugins
   - one suspect plugin at a time
   - suspect plugin pairs
   - current session reset vs old session
   - tool-assisted recall vs no-tool context-only recall
5. Compare installed artifacts, not source trees. Record plugin version, install
   path, expected marker in `dist/`, Gateway restart, and the exact live probe.
6. For repeated calls, inspect what arrived after the first tool result. If the
   result lacks a durable "this request is satisfied" signal, or replay demotes
   it into ordinary text, fix that state boundary instead of only adding loop
   containment.
7. For post-tool halts, distinguish provider stop, harness liveness decision,
   channel delivery failure, and model plan-only output. A retry guard is a
   catchall; still look for the plugin/context input that made the model stop.
8. Keep the falsifier next to the hypothesis: name the observation that would
   prove the root cause is not harness, not plugin A, not plugin B, or not memory
   replay.
9. When two plugins only fail together, trace their shared contract: provider
   input, tool result shape, context-engine replay, and any side memory/user-card
   injection. Do not blame the plugin that made the visible call until the
   post-tool provider payload proves it reintroduced the intent.
10. For loop fixes, prefer a durable execution-state invariant over a loop
    detector: after a tool fulfills the active request, the next provider turn
    must see that completion as current-turn state, not only as historical text.

## Model Transport Logs

Use targeted env flags instead of global debug when the model request shape or
stream timing matters:

```bash
OPENCLAW_DEBUG_MODEL_TRANSPORT=1 openclaw gateway
OPENCLAW_DEBUG_MODEL_PAYLOAD=tools OPENCLAW_DEBUG_SSE=events openclaw gateway
OPENCLAW_DEBUG_MODEL_PAYLOAD=full-redacted OPENCLAW_DEBUG_SSE=peek openclaw gateway
```

Useful flags:

- `OPENCLAW_DEBUG_MODEL_TRANSPORT=1`: request start, fetch response, SDK
  headers, first SSE event, stream done, and transport errors at `info`.
- `OPENCLAW_DEBUG_MODEL_PAYLOAD=summary`: bounded payload summary.
- `OPENCLAW_DEBUG_MODEL_PAYLOAD=tools`: all model-facing tool names.
- `OPENCLAW_DEBUG_MODEL_PAYLOAD=full-redacted`: capped, redacted JSON payload.
  Use only while debugging; prompts/message text may still appear.
- `OPENCLAW_DEBUG_SSE=events`: first-event and stream-completion timing.
- `OPENCLAW_DEBUG_SSE=peek`: first five redacted SSE events.
- `OPENCLAW_DEBUG_CODE_MODE=1`: code-mode tool-surface diagnostics.

Watch logs with:

```bash
openclaw logs --follow
```

## Context-Efficient Capture

Use artifact-first capture when raw transport output would flood the chat or
context window.

- For HTTP traffic, write packet captures to disk first:
  `tcpdump -i any -s 0 -w /tmp/openclaw-ollama.pcap '<filter>'`.
- Summarize with stock macOS tools before pasting:
  `tcpdump -nn -tttt -r /tmp/openclaw-ollama.pcap 'tcp port <port>' | head`
  and `strings /tmp/openclaw-ollama.pcap | grep -E '<small pattern set>'`.
- Prefer trajectory/event summaries for run timing, token counts, model calls,
  and tool calls. Keep full trajectory bundles private unless explicitly
  sanitized.
- Do not assume `rg` or `tshark` exist on a live Mac. Provide `grep`, `strings`,
  `tcpdump -r`, `python`, or `node` fallbacks in exact commands.
- Paste reports under 100 lines by default; point to artifact paths for the raw
  evidence.

## Common Boundaries

- **Config vs activation:** config can be enabled while the run disables tools,
  is raw, has an empty allowlist, or lacks model tool support. Check the actual
  visible tools before enforcing provider payload invariants.
- **Tool surface:** inspect final model-visible tool names, not only the tool
  registry or config. Code mode means exactly `exec` and `wait` only after it
  actually activates.
- **Provider payload:** log fields, model id, service tier, reasoning, input
  size, metadata keys, prompt-cache key presence, and tool names before SDK
  call.
- **Fetch vs SSE:** fetch response proves HTTP headers arrived; first SSE event
  proves provider body progress. A gap here is a stream/body/provider issue, not
  tool execution.
- **Worker/dist:** run `pnpm build` when touching workers, dynamic imports,
  package exports, lazy runtime boundaries, or published paths.
- **Live keys:** use the configured secret workflow for missing provider keys
  before saying live proof is blocked. Env checks are presence-only; never print
  secrets.

## Deploy / Install Proof

For live plugin or runtime installs, prove the installed artifact, not only the
source checkout:

- Use absolute `src` and `dst` paths; print or inspect both before destructive
  copy.
- Create a timestamped backup of the existing installed artifact before
  overwriting.
- After copy, inspect the installed path for package/manifest identity and an
  expected semantic marker: package name, plugin id, version/build stamp, or a
  newly added symbol/string in `dist/`.
- Treat build success, copy success, and clean source tests as insufficient; the
  live process only sees the installed artifact.
- If the installed identity or marker check fails, do not trust the live
  instance. Restore or reinstall from the correct source before restarting.
- Restart managed services only after artifact checks pass, then run the narrow
  live probe that failed before.
- If a live-daemon probe uses a synthetic session, first prove the daemon has
  relevant persisted state for that session. `totalTurns=0`, missing cursors, or
  `overbudget_not_compacted` can prove the probe is invalid, not that the patch
  failed.
- Compare source tests, packed artifact tests, installed `dist/` marker checks,
  and live behavior separately. A fake RPC test can prove local logic while
  still missing real daemon output shape.

## Code Pointers

- Model payload + Responses stream:
  `src/agents/openai-transport-stream.ts`
- Guarded fetch/timing:
  `src/agents/provider-transport-fetch.ts`
- OpenAI/Codex provider wrappers:
  `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
- Tool construction, Tool Search, code-mode activation:
  `src/agents/pi-embedded-runner/run/attempt.ts`
- Code-mode runtime and worker:
  `src/agents/code-mode.ts`
  `src/agents/code-mode.worker.ts`
- Tool Search catalog:
  `src/agents/tool-search.ts`

## Proof Choice

- Single helper/payload bug: local targeted Vitest.
- Docs/logging-only: `pnpm check:docs` and `git diff --check`.
- Worker/dist/lazy import/package surface: targeted tests plus `pnpm build`.
- Live provider/model behavior: same provider/model with debug flags and a real
  key if available.
- Docker/package/Linux/CI-parity: `$crabbox`.
- CI failure: exact SHA, relevant job only, logs only after failure/completion.

## Output Habit

Report:

- boundary tested
- exact command/env shape, redacted
- observed signal, such as tool names or first SSE event timing
- fix location
- narrow proof and any remaining risk
