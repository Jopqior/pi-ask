# Elaboration delivery boundaries

Research for [Jopqior/pi-ask #2](https://github.com/Jopqior/pi-ask/issues/2), child of [map #1](https://github.com/Jopqior/pi-ask/issues/1). Baseline: `41fb3f61f1298ed30311489e584e1ff6d5d4b706`. Research only. No product fix, interaction decision, or extension-managed follow-up proposal.

## Finding

There is a deterministic information-loss bug before model inference. In mixed Elaborate, changing an unrelated committed answer produces identical tool `content`, rendered transcript, and complete synthetic Codex provider message arrays. The choice remains in structured `details`. The linked upstream patch repairs that branch, but does not provide a complete result-delivery contract for all completion modes or identities.

Separately, upstream reports models re-asking preserved questions or answering only in hidden thinking. Those are behavioral reports, not reproduced model outcomes here. Complete output and explicit visible-answer guidance are testable delivery requirements; their presence cannot guarantee model compliance. Extension-managed follow-up is expressly outside this research's scope.

## Sources and versions

First-party reports, read with `gh issue view <n> --repo eko24ive/pi-ask --json title,body,comments,url`:

- [Upstream #1](https://github.com/eko24ive/pi-ask/issues/1): author reports re-asking a preserved question after clarification despite structured continuation data. The owner's comment says stronger guidance was unreliable. This is not evidence that the model received every `details` field. Its reference to `reaskQuestions` also does not describe this baseline's current type. The owner's proposed extension-managed approach is excluded by the user's scope.
- [Upstream #15](https://github.com/eko24ive/pi-ask/issues/15): identifies unrelated-answer loss from model-visible content, with candidate [Maverobot commit `5322603041f9984bae92778609b31e2867550a69`](https://github.com/Maverobot/pi-ask/commit/5322603041f9984bae92778609b31e2867550a69). Parent is `49482b7e5d0d57be8af1db81f490f6e860792cfb`. Its formatter is byte-identical to this fork's baseline formatter, verified with `gh api .../contents/src/result-format.ts?ref=<parent>` and `cmp`.
- [Upstream #17](https://github.com/eko24ive/pi-ask/issues/17): reports absent visible clarification, especially Claude Opus 5.5, in Elaborate and Submit. Reporter environment is Pi 0.99.1 and pi-ask 1.2.0; this research does not reproduce that environment or query that model.

Local project dependencies are pinned to Pi 0.84.1; the separately installed Pi runtime is 1.0.2. Both provider converters were exercised. Pi 1.0.2's upstream tag resolves to [`cd32f7725fdbddbaecdff5b1e68491563394e0ca`](https://github.com/earendil-works/pi/tree/cd32f7725fdbddbaecdff5b1e68491563394e0ca).

Read in full from the installed Pi 1.0.2 distribution: coding-agent README, `docs/extensions.md`, `docs/tui.md`, `docs/custom-provider.md`, `docs/rpc-extension-ui.md`; followed relevant source references and read `examples/extensions/hello.ts` and `todo.ts`. The [extension contract](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/docs/extensions.md) explicitly separates model-facing `content` from rendering/state `details`. The examples use that separation for both tool output and state reconstruction.

Local implementation references below are relative to the baseline above:

- [State/result serialization](../src/state/result.ts), [answer serialization](../src/state/answers.ts), [types](../src/types.ts)
- [Shared formatter](../src/result-format.ts), [tool helpers and guidelines](../src/ask-tool-helpers.ts), [result renderer](../src/result.ts)
- [Tool execution](../src/ask-tool.ts), [controller completion](../src/ui/controller.ts)
- [Answer/replay delivery](../src/answer-commands.ts), [interrupted recovery](../src/resume-pending-ask.ts), [payload persistence](../src/ask-payload-store.ts), [remote normalization/events](../src/remote-ask.ts)
- [Contract](../docs/contract.md), [architecture](../docs/architecture.md), [remote event contract](../docs/remote-events.md)

## Reproducible evidence

Assets: [boundary harness](./elaboration-delivery-boundaries.mjs) and [entrypoint harness](./delivery-entrypoints.mjs). All inputs are invented. They do not read sessions, credentials, or user config. The entrypoint probe seeds config in memory and disables external notifications. No provider network request is made.

From this research worktree, with project dependencies installed:

```sh
node research/elaboration-delivery-boundaries.mjs
# Expected exit 1: 11 pass, 17 fail on the baseline.
```

Default provider imports resolve the project's Pi 0.84.1. To exercise a separate installed runtime, set `PI_PACKAGES_DIR` to its `node_modules/@earendil-works` directory:

```sh
PI_PACKAGES_DIR="<Pi installation>/node_modules/@earendil-works" \
  node research/elaboration-delivery-boundaries.mjs
```

The installed Pi 1.0.2 produces the same baseline verdict. This combines the fork's real state/helpers/TUI dependency with the specified runtime's real `convertToLlm` and Codex message converter. It does not claim to boot the full extension inside both Pi versions.

To compare the exact upstream candidate without modifying product files:

```sh
candidate=$(mktemp)
gh api 'repos/Maverobot/pi-ask/contents/src/result-format.ts?ref=5322603041f9984bae92778609b31e2867550a69' \
  --jq .content | base64 --decode > "$candidate"
CANDIDATE_FORMATTER="$candidate" node research/elaboration-delivery-boundaries.mjs
# Expected exit 1: 17 pass, 11 fail. Repeat with PI_PACKAGES_DIR for installed Pi.
rm "$candidate"
```

The Node load hook replaces only the formatter's loaded source with that exact candidate. It does not write to `src/`, cherry-pick the fix, or test a hand-reimplemented approximation. Node 24.20.0 was used. Candidate formatter SHA-256: `18ef0cffdbb0ac12a6a11d7303b4ce7c9e6e84fcec9d47ea7b40412be2c85559`.

Installed Pi 1.0.2 SHA-256 fingerprints:

- `pi-ai/dist/api/openai-responses-shared.js`: `8744ad2ce9ce2512993360600760f5bcdbeb520d0a641c655b2a0b7cbe9db10a`
- `pi-coding-agent/dist/core/messages.js`: `8688b3f6eb28865f779cac998bd4754d1a4f08703200dfe0dd5a799aa0d42ef6`

### Loop and minimization

The harness uses real normalization, selection/custom/note transitions, the review completion action, `toAskResult`, `successfulResponse`, and `renderAskToolResult(...).render(...)`. Rendered padding is trimmed, not content. It then constructs the same synthetic assistant tool call plus actual tool response and runs both Pi conversion stages. Collision checks compare whole provider message arrays, not just a substring of a presumed prompt.

Minimum: two questions, one committed choice on Scope, one note on Rollout, Elaborate. The third unanswered question in the broader matrix is removed in a separate minimal probe. Changing Scope between Local only and Global change still produces exactly this content and transcript:

```text
User asked to elaborate on question "How should we roll it out?" with note "Explain rollback"
```

Provider function output:

```json
{"type":"function_call_output","call_id":"call_fixture","output":"User asked to elaborate on question \"How should we roll it out?\" with note \"Explain rollback\""}
```

Both runs have identical original tool arguments, so the model knows the offered choices but cannot recover which Scope choice the user committed. Removing the note takes the no-note fallback, which distinguishes the ordinary labels again. One question with its own note keeps its answer text. The cross-question omission needs the unrelated-answer-plus-note combination.

Initial expanded loop was 9 pass / 14 fail. After adding minimal, identity, and real entrypoint probes, the final matrix is 11 pass / 17 fail. The old preliminary 4/2 result was treated as a lead, not copied as evidence. Failures deliberately assert information preservation and instruction visibility; they are not 17 independent bugs, nor 17 failed existing contract tests.

## Boundary diagnosis

Ranked hypotheses after the first red run:

1. **Formatter loss:** if the note branch returns before enumerating other answers, removing the note or injecting the candidate formatter will restore unrelated answers. Both predictions hold.
2. **No provider rescue:** if only `content` is mapped into provider tool output, changing `details` alone cannot change provider messages. The actual converter probe confirms this.
3. **Independent identity collapse:** if labels are joined without canonical values or boundaries, distinct answers remain indistinguishable outside the candidate's preserved-answer branch. The paired selection, comma-label, and target-identity probes confirm this.

`toAskResult` retains committed answers and, for Elaborate, builds `continuation` and full `elaboration` items. A note-only question is excluded from `answers` but represented in those structures. In `formatElaborationLines`, nonempty note lines return early. Only a noted question's own answer labels appear in its clarification line; unrelated committed answers and explicit unanswered statuses are not enumerated. With no notes, committed answers are rendered by the separate fallback. With neither notes nor answers, only the generic elaboration message remains.

`successfulResponse` places only `summarizeResult(result)` in `content`, with the full result in `details`. The transcript renderer reads `details`, but immediately applies the same lossy formatter. Therefore inspecting either a green structured assertion or the visible transcript does not establish provider completeness.

Pi's [`convertToLlm`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/coding-agent/src/core/messages.ts) actually passes ordinary tool-result objects through. It is inaccurate to say this function itself strips `details`. The downstream [`convertResponsesMessages` / `convertToolResultOutput`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/ai/src/api/openai-responses-shared.ts) constructs `function_call_output` from `msg.content`, not `msg.details`. [`openai-codex-responses.ts`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/ai/src/api/openai-codex-responses.ts) calls this converter when building request `input`. Installed Anthropic's [`convertToolResult`](https://github.com/earendil-works/pi/blob/cd32f7725fdbddbaecdff5b1e68491563394e0ca/packages/ai/src/api/anthropic-messages.ts) likewise uses `convertContentBlocks(msg.content)`; this last observation is source inspection, not an Anthropic request experiment.

## Coverage comparison

| Case | Baseline | Candidate `5322603` |
|---|---|---|
| Other question has note; ordinary committed selection/custom answer | Missing from content, transcript, provider messages | Preserved with prompt, question id, value/label arrays, custom text |
| Other question has note; equal option labels or comma-containing label | Distinct commitments collapse | Preserved arrays distinguish them |
| Answer on the noted question | Label text retained, canonical values/custom origin not explicit | Unchanged |
| Equal labels/comma boundary on the noted question | Collides in content, transcript, provider | Unchanged collision |
| No-note Elaborate with ordinary answer | Answer text present | Unchanged |
| No-note Elaborate with equal labels/comma ambiguity | Collides | Unchanged collision |
| Elaborate unanswered question | Status present only in details; no explicit line | Unchanged |
| All-unanswered/no-note Elaborate | Generic message; no per-question status | Unchanged |
| Notes on questions with identical prompts, or options with identical labels | Target ids/values differ in details but output collides | Unchanged collision |
| Submit ordinary answer and question/selected-option notes | Text present; no answer-first instruction | Unchanged |
| Submit custom question versus same text as an option label | Same content/provider messages; custom-only transcript adds `(wrote)` | Unchanged |
| Submit equal labels/comma ambiguity | Collides | Unchanged collision |
| Submit unanswered/note-only question | Explicit `(no answer)` plus question note if present | Unchanged |
| Elaborate answer-first instruction and continuation statuses | Serialized in details, absent from content | Unchanged |
| Cancellation | Cancellation summary/renderer hides answers | Unchanged |

The candidate modifies the formatter only when there are notes. It appends answers whose question ids are absent from the note items and whose labels are nonempty. It does not change schemas, state, persistence, remote events, prompt guidelines, or completion semantics. Its added tests cover unrelated selected/custom/multi answers, equal-label and comma collisions in that branch, cancellation, and absence of unselected choice text. The issue's reported 209-test result is upstream's claim, not this fork's suite count.

Submit custom text can be a final answer, a request for information, or both. Current result mode and text do not encode that distinction. This is an intent-contract question still owned by the map, not permission to classify every custom answer or note as a clarification request. Multi-select labels append custom text without a transcript origin marker; the `(wrote)` branch applies only to custom-only answers. Submit intentionally filters notes on unselected options; Elaborate includes them. The harness confirms both, so that filtering must not be mislabeled as the same early-return bug.

## Shared delivery paths

| Entry | Result delivery | Evidence and boundary |
|---|---|---|
| Ordinary `ask_user` | Tool response has summary content and full details | Real registered tool, real controller, synthetic remote answer; result equals completed event |
| `/answer` | Extracts form, then shared `runAskAndSendSubmittedResult` sends summary as user text | Source audit of extraction and final sender; live extractor/loader not exercised |
| `/answer:again`, `/ask:replay` | Revalidated stored form, then same user-text sender | Real registered command/controller with synthetic branch and remote response |
| Interrupted `ask:resume` | Detached recovery sends summary as user text; appends pending dismissal | Real lifecycle handler/controller exercised; busy context yields `deliverAs: "followUp"` |
| Remote `answer` | Normalizes ids/values into state; controller completes normally | Actual event bus/runtime/controller exercised, plus direct normalization equivalence |
| Remote `completed` | Trusted in-process consumers receive full `AskResult` | Event retains Scope choice even when subsequent model text omits it |

All dynamically exercised entrypoints yield the same summary for the mixed-note fixture. Remote is not an alternate model-visible serializer, network endpoint, or headless TUI implementation. Submit acknowledgments only confirm validation/completion; they do not establish that the model received the complete result. The completed event is a separate structured boundary and does retain that result.

Command/recovery messages do not attach tool-result `details` or use the ask tool's result renderer. Cancellation sends no user message on those paths, whereas ordinary tool cancellation returns cancellation text. Replays persist/reopen forms, not answer state; they are not the extension-managed follow-up excluded by scope. Non-TUI execution returns the interactive-input fallback instead of opening a remotely answerable custom surface.

## Verification and limits

Executed on this fork:

```text
node research/elaboration-delivery-boundaries.mjs
  baseline: 11 pass / 17 fail; exit 1
  candidate: 17 pass / 11 fail; exit 1
  repeated with project Pi 0.84.1 and installed Pi 1.0.2
pnpm typecheck
  pass
node --test tests/result.test.ts tests/state.test.ts tests/ask-tool.test.ts
  71 pass
node --test tests/answer-commands.test.ts tests/pending-ask.test.ts tests/remote-ask.test.ts
  19 pass
pnpm test
  205 pass
```

Existing tests establish their asserted state/formatting behavior, not full delivery. The preliminary targeted count of 68 does not match the explicitly selected three-file command here; 71 is the rerun result. Research JS was formatted and checked separately with `pnpm exec biome check --write research/*.mjs`, without rewriting product files. Initial harness lint failures were corrected; the final research-only Biome check passes.

No raw local sessions were read, copied, or uploaded. No live model, provider request, real terminal interaction, compaction, context-mutating third-party extension, or end-to-end `/answer` extraction was tested. Host session/UI/event services in entrypoint tests are in-memory doubles; production controller and senders are real. Provider probes cover Codex conversion, not every provider or user configuration. Custom extensions could deliberately add details to context, so the claim concerns Pi's inspected default boundary.

The evidence supports output-completeness and identity regression requirements, and exposing intended guidance in the channel the model actually receives. It does not settle per-question Submit/Elaborate UX, approval semantics, whether an unresolved choice needs another ask, or any guarantee that text alone prevents re-asking or hidden-only answers. Those decisions remain with the map's human decision tickets.
