# Ask tool contract

`ask_user` is a pi-native clarification tool for cases where implementation depends on user preference or missing requirements.

This document defines the stable external behavior. It does not explain internal helper-by-helper implementation.

## Input

```ts
{
  title?: string;
  questions: Array<{
    id: string;
    label?: string;
    prompt: string;
    type?: "single" | "multi" | "preview";
    options: Array<{
      value: string;
      label: string;
      description?: string;
      preview?: string;
      recommended?: boolean;
    }>;
  }>;
}
```

## Input rules

- at least one question is required
- every question must have non-empty trimmed `id` and `prompt`
- every question must have at least one option
- question ids must be unique within one tool call
- option `value`s must be unique within a question
- blank optional `title`, question `label`, option `description`, and option `preview` fields are treated as omitted
- question `label` falls back to `Q1`, `Q2`, ...
- option `label` is required in the public schema; before schema validation, a missing or blank string label is derived from a non-empty `value` by replacing hyphens and underscores with spaces and capitalizing the first character
- `recommended` is optional presentation metadata; zero, one, or multiple options may set it to `true`
- recommended options render warning-colored `(recommended)` followed by muted ` | <description>`, or only `(recommended)` when no description exists, but are not preselected
- `type` defaults to `single`
- `required` is removed from the model-visible schema; legacy calls and stored questions may still carry it, but it is accepted and ignored
- new and recovered forms require valid answers for every question regardless of legacy `required` values
- preview questions require preview text for every declared option; option descriptions do not satisfy this requirement, and invalid preview payloads report a fix hint to add preview text or switch to `type: "single"`
- all questions get an internal `Type your own` option

## Output (version 2)

Normal tool and recovered TUI flows return this result in `details`, alongside `content: [{ type: "text", text: string }]`:

```ts
{
  version: 2;
  title?: string;
  cancelled: boolean;
  error?: {
    kind: "invalid_input";
    issues: Array<{ path: string; message: string }>;
  };
  questions: Array<{
    id: string;
    label: string;
    prompt: string;
    type: "single" | "multi" | "preview";
    presentedType?: "single" | "multi" | "preview";
    options: Array<{
      value: string;
      label: string;
      description?: string;
      preview?: string;
      recommended?: boolean;
    }>;
  }>;
  answers: Record<string, {
    intent: "answer" | "elaborate";
    values: string[];
    labels: string[];
    indices: number[];
    customText?: string;
    note?: string;
    optionNotes?: Record<string, string>;
  }>;
}
```

## Output rules

- `intent: "answer"` is an ordinary answer; `intent: "elaborate"` marks the selected content as tentative explanation context, not a final decision
- intent is independent per question; notes, selections, editing, navigation, and type changes never infer or change it
- version 2 has no global `mode`, `continuation`, or `elaboration` fields
- successful TUI submission includes a valid answer for every question; only notes, only Elaborate, or a deselected custom draft cannot satisfy submission
- `questions` retains every normalized prompt and the full declared option list, including descriptions, previews, and recommendation metadata, as explanation background
- `answers` retains all question notes and all option notes, including notes on unselected options, for ordinary and tentative answers alike
- `optionNotes` is keyed by declared option value; selected option indices identify which declared options are selected, independently of notes and custom text
- single-select answers still use arrays; recommendation markers never change canonical labels or values
- result metadata keeps the requested `type` and adds `presentedType` when final presentation differs; basic result text uses one compact note when answered questions were presented differently
- `indices` are 1-based declared option positions; the synthetic custom answer has no index
- `customText` stores selected free-form text; on single-select it replaces declared selections, while on multi-select it augments them and is appended last to `values` and `labels`
- saving custom text stays on the current question with the custom row selected and focused; deselecting saved text keeps a UI draft but omits it from the result
- saving or clearing multi-select custom text does not clear other selections
- `cancelled: true` means dismissal, unavailable UI, or invalid input before UI opened; version 2 cancellation always has `answers: {}` and never delivers draft selections, custom text, or notes
- cancellation may retain normalized question metadata and validation errors; it is not subject to all-questions-answered validation
- semantically invalid payloads return `error.kind === "invalid_input"`, structured `issues`, and a transcript-friendly `Invalid ask_user payload:` message; rendered status is `Invalid tool payload`
- missing schema-required fields fail Pi validation before execution and use Pi's standard tool-error result without structured `details`

Version 2 text currently shows basic answers, ordinary/tentative intent, and notes (including unselected-option notes). Complete contextual text, identity/source disambiguation, and model follow-up instructions are deferred to later tickets; the full structured context is already retained in `details`.

Unversioned historical results remain read-only legacy results: their global `mode`, answers, notes, and unanswered states keep the old semantics. Never infer per-question intent from legacy mode or notes. Unknown versions or malformed results fall back safely rather than rendering as successful version 2 results. Remote submissions remain legacy until the remote upgrade ticket. See [`interface-upgrade.md`](interface-upgrade.md).

## Supported UX

- tabbed multi-question flow
- single-select, multi-select, and preview questions
- optional warning-colored recommendation subtitles in standard and preview option lists without automatic selection
- active question type changes via configurable `main.changeQuestionType` hotkey, default `t`; non-preview questions toggle `single <-> multi`; preview questions toggle `preview <-> multi`
- inline free-form answers for all question types
- native pi-style `@` file path autocomplete inside free-form answer and note editors
- question notes via `Shift+N`
- option notes via `n`
- number-key quick selection
- explicit per-question Elaborate toggle via `main.toggleElaborate` (default `e`), available with or without notes
- Submit/Cancel Review tab; advancing from the final question always opens Review without submitting
- Review labels questions `Answered`, `Tentative · Elaborate`, or `Unanswered` and shows all saved question/option notes
- the missing-answer warning remains visible while any question is unanswered
- Submit stays in Review and lists missing questions unless every question has a valid declared selection or selected nonblank custom answer; Cancel remains available
- transcript-friendly call and result rendering
- automatic recovery of the newest unresolved `ask_user` form on startup, resume, or fork
- ask settings list with binary behaviour/notification toggles and a guarded reset-to-defaults action
- `?` in the ask flow and `/ask-settings` in pi open the same lightweight ask settings overlay
- settings attempt to persist immediately when changed: `Confirm dismiss when dirty`, `Double-press review shortcuts`, `Notifications`, and `Show footer hints`; `Present single-select as multi-select` persists immediately when saving succeeds but applies only to new/recovered ask flows; save failures revert the setting and show a manual-edit message; resetting config to defaults requires pressing the reset action twice within a short confirmation window
- `Keymaps` is a persisted, context-aware config section for global, main-flow, editor, note-editor, and settings-modal actions
- the settings list shows the absolute config file path for customizing keymaps and notifications

## Keyboard behavior

Main flow:

- `global.settings` opens ask settings; default: `?`
- `global.dismiss` dismisses the active ask surface; default: `Ctrl+C`
- `main.nextTab` / `main.previousTab` move between tabs; defaults: `Tab`/`Right`, `Shift+Tab`/`Left`
- `main.nextOption` / `main.previousOption` move between options or review actions; defaults: `Down`, `Up`
- `main.confirm`, `main.cancel`, and `main.toggle` confirm, cancel, or toggle; defaults: `Enter`, `Esc`, `Space`
- on single-select questions (including preview), digits select without advancing and repeated digits are idempotent; `Space` toggles without advancing; `Enter` selects the highlighted normal option and advances
- on multi-select questions, digits/`Space` toggle options and `Enter` advances without changing selections
- focusing an empty custom row with digits or Up/Down automatically opens its editor; saved custom text does not reopen on focus
- `main.editCustomAnswer` (default `c`) is shown and active only on the focused saved custom row and reopens its text for editing
- on single-select (including preview), `Enter` on saved custom text confirms it and advances without overwriting it; digits select it idempotently and `Space` toggles it
- on multi-select, digits/`Space` toggle saved custom text; `Enter` advances without reselecting a deselected draft
- `main.changeQuestionType` changes the active question type (non-preview: `single <-> multi`; preview: `preview <-> multi`); default: `t`; destructive `multi -> single` changes require pressing the type hotkey again, with no timeout, and the pending confirmation clears on other navigation/actions
- `main.toggleElaborate` toggles the active question's intent without changing its answer; default: `e`; the question view displays `Elaborate: on` or `Elaborate: off`, even without notes
- `main.optionNote` and `main.questionNote` open option/question notes; defaults: `n`, `Shift+N`
- `1..9` is fixed and selects or toggles the matching option; on Review, `1` triggers Submit, `2` triggers Cancel, and `3` does nothing
- when `Double-press review shortcuts` is enabled, review-tab `1` and `2` require the same key twice without a timeout, and the review screen shows an inline hint for the pending action

Editing flow:

- `editor.submit` saves and closes the custom-answer editor, staying on the question with focus on the custom row; default: `Enter`; a second `Enter` confirms/advances as described above
- `noteEditor.save` saves the current note editor and keeps the ask flow open; default: `Enter`
- `editor.close` / `noteEditor.close` save draft and close the editor; default: `Esc`
- `global.dismiss` dismisses the entire flow immediately without saving the current editor draft when no dirty-dismiss confirmation is pending
- `global.settings` opens ask settings when the editor is empty; otherwise the key is delegated to the editor as text/input
- when editor has text, arrow keys and `Tab` stay in the editor so the cursor can move while typing
- when editor is empty, editor-context `*WhenEmpty` navigation actions move options or tabs without requiring the editor close binding first
- `c` and `e` are ordinary text inside editors; native completion and the fixed `@` file-reference affordance remain available

Settings modal:

- `settingsModal.close` closes settings; defaults: `Esc`, `Ctrl+C`, `?`
- `settingsModal.nextOption` / `settingsModal.previousOption` move between settings; defaults: `Down`, `Up`
- `settingsModal.toggle` toggles the highlighted setting and attempts to save immediately; if saving fails, the setting reverts and an error is shown; on the reset action, the same binding must be pressed twice within a short confirmation window; defaults: `Enter`, `Space`

Dirty dismiss:

- when `Confirm dismiss when dirty` is enabled, cancelling or dismissing a dirty ask flow requires the same action a second time
- the dirty-dismiss warning stays visible until the user changes tabs in the ask flow

Destructive type changes, dirty dismissal, review double presses, and settings reset retain independent confirmation guards; no action can confirm another guard.

## Config version

- any config containing `behaviour.autoSubmitWhenAnsweredWithoutNotes` blocks ask before migration, regardless of the field value (including `false`); the error names the actual current or legacy source path and requires manual field removal followed by `/reload` or restart, with no fallback to defaults
- this blocking rule applies to normal tool calls in every mode and interrupted-form recovery; blocked recovery does not dismiss the pending call or deliver an answer
- current persisted schema is version 9; explicit saves write version 9
- after the removed-field check passes, versions 1–8 migrate in memory, adding missing `main.editCustomAnswer: ["c"]` and `main.toggleElaborate: ["e"]` while preserving existing bindings and other settings; obsolete `answer` settings remain discarded
- invalid keymaps, including collisions introduced by the new default binding, fall back to the full default keymaps with a warning while preserving valid behaviour and notification settings/channels
- loading or migrating never writes or creates a config file; if neither current nor legacy config exists, built-in defaults are used in memory until an explicit save

## Non-TUI and non-interactive modes

The rich ask flow uses `ctx.ui.custom()` and opens only in TUI mode. After config validation succeeds, in print, JSON, RPC, or any other non-TUI mode, the tool returns a `Needs user input: ask_user requires interactive TUI mode.` message in `content` and a cancelled result in `details` instead of opening custom UI.

The public tool schema requires question `id` and `prompt` plus option `value` and `label`, and it restricts question `type` to `single`, `multi`, or `preview`, so malformed structural fields fail before execution. The tool still validates trimmed text, uniqueness, option counts, and preview requirements during execution and returns structured issues for those failures. Result rendering falls back to Pi's raw tool-error text when schema validation prevents execution.

The ask flow subscribes to runtime settings updates while open. In practice, this means changing `Confirm dismiss when dirty`, `Double-press review shortcuts`, `Notifications`, `Show footer hints`, resetting config to defaults, or reloading config-backed keymaps can affect the in-progress ask flow immediately instead of only future asks when the change is saved or otherwise applied in memory. Load-time migrations and invalid config handling do not rewrite, rename, or back up the config file; invalid files load defaults for the session and show a notice, except that the removed auto-submit field blocks ask instead. `Present single-select as multi-select` is applied when an ask flow is created and does not rewrite question semantics for an already-open flow; use `main.changeQuestionType` for live per-question changes.

## Notifications

When enabled, pi-ask emits one best-effort external notification per ask session after the ask UI opens and waits for input. The default title is `pi ask`; the message is `Question waiting: <label or prompt>`. Channels run in configured order and failures never fail or cancel the ask flow.

## Remote inter-extension events

pi-ask exposes a local `pi.events` contract for trusted Pi extensions. It does not expose a network API and does not automate terminal keystrokes. RPC or headless integrations should use a trusted in-process bridge extension that consumes these events rather than expecting the TUI-only custom surface to open.

Channels:

- `@eko24ive/pi-ask:started`
- `@eko24ive/pi-ask:completed`
- `@eko24ive/pi-ask:submit`
- `@eko24ive/pi-ask:submit-result`

The remote submission boundary still uses the legacy event/result protocol and global mode semantics; it does not translate them into per-question intent. Its version 2 migration and full-answer validation are deferred.

Remote submissions must be explicit `{ kind: "answer" }` or `{ kind: "cancel" }` responses. Remote answers use question ids and normalized option values from the started event. pi-ask validates ids and values, recomputes labels/indices, and does not infer approval semantics from labels.

See [`remote-events.md`](remote-events.md) for payload shapes, examples, and a local smoke test.

## Payload capture

- valid `ask_user` payloads are persisted as `ask:payload` branch custom entries before the UI opens, with source `tool` only
- recovery looks up payloads only on `ctx.sessionManager.getBranch()` and revalidates them before use; sibling/future branch entries and obsolete non-tool payloads are ignored

## Interrupted ask resume

- on `session_start` with reason `startup`, `resume`, or `fork`, pi-ask finds the newest `ask_user` tool call on the active branch that has neither a tool result nor an `ask:pending-dismissed` entry
- recovery does not run for `new`, `reload`, or non-TUI sessions
- the matching valid `ask:payload` supplies the form; if it is missing or invalid, pi-ask validates and uses the original tool call arguments instead
- recovery stores questions only, never answer drafts; old `required` fields are ignored and reopening applies the same per-question intent, Review validation, and version 2 result rules as a new TUI flow
- the recovery flow is detached from `session_start`, so an open form does not block other lifecycle handlers
- because the interrupted `execute` promise no longer exists, submit sends the version 2 result as a normal user message, queued as a follow-up if the agent is busy
- submit and cancel append `ask:pending-dismissed` for that tool call, preventing it from automatically reopening again; cancel sends no message to the agent
- remote lifecycle sources are only `tool` for live tool execution and `ask:resume` for recovered flows

The fallback message includes normalized pending questions and options so the caller can re-ask them manually. `details.questions` still contains normalized question metadata, while `details.answers` stays empty until a user responds.

## Skill alignment (advisory)

The auto-bundled skill profile at `skills/ask-user/SKILL.md` defines agent-side decision-gate guidance for when to call `ask_user`. It is enabled by default when the package is installed, but can be disabled via `pi config`.

It is advisory only. If there is any conflict, contract + tests win.

## Source of truth

Behavior should be verified against:

1. `src/types.ts` and exported state/result helpers
2. `tests/*.test.ts`
3. this contract
