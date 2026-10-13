# Interface upgrade: per-question intent and result v2

This covers [#20](https://github.com/Jopqior/pi-ask/issues/20), the first implementation ticket under [#16](https://github.com/Jopqior/pi-ask/issues/16). Complete contextual text, source disambiguation, model follow-up instructions, and remote v2 are later work.

## New TUI results

Normal tool execution and interrupted-question recovery produce `AskResultV2` from `src/types.ts`:

- `version: 2` identifies the result format, separately from config `schemaVersion` and remote event versions.
- `answers[id].intent` is `answer` (ordinary answer) or `elaborate` (tentative content for explanation, not a final decision).
- There is no global `mode`, `continuation`, or `elaboration`.
- `questions` includes the full declared options, with `description`, `preview`, and `recommended` when supplied. The prompt and option metadata retain explanation background.
- Every answer retains its selected content, question `note`, and all `optionNotes`, including notes on unselected options. Notes are keyed by declared option value; declared selections have 1-based `indices`, while selected custom text has no index and is appended to `values`/`labels`.
- Cancellation always has empty `answers`, including unavailable-UI and invalid-input results. Question metadata and validation errors may remain.

Example `details` with one ordinary and one tentative answer:

```json
{
  "version": 2,
  "cancelled": false,
  "questions": [
    {
      "id": "scope", "label": "Scope", "prompt": "Which scope?", "type": "single",
      "options": [{ "value": "local", "label": "Local" }]
    },
    {
      "id": "storage", "label": "Storage", "prompt": "Which storage?", "type": "single",
      "options": [
        { "value": "sqlite", "label": "SQLite", "description": "Embedded database" },
        { "value": "postgres", "label": "PostgreSQL", "description": "Separate server" }
      ]
    }
  ],
  "answers": {
    "scope": { "intent": "answer", "values": ["local"], "labels": ["Local"], "indices": [1] },
    "storage": {
      "intent": "elaborate", "values": ["sqlite"], "labels": ["SQLite"], "indices": [1],
      "note": "Explain this choice before I decide.",
      "optionNotes": { "postgres": "What would running a server involve?" }
    }
  }
}
```

`e` (`main.toggleElaborate`) explicitly toggles intent on a question, even without notes. Selection, editing, notes, navigation, and presentation changes preserve intent; editor `e` remains text. Review shows ordinary, tentative, and unanswered questions and offers only Submit/Cancel. Every question needs a valid selection or selected nonblank custom answer to submit, including tentative questions. Missing answers keep Review open. Digits `1`/`2` submit/cancel with the existing double-press setting; `3` has no action. Cancellation bypasses answer validation.

Text output currently provides basic answers, tentative-intent markers, and notes. Consumers needing complete context should use structured `details`; full contextual/disambiguated text and model instructions are not part of this ticket.

## Input and recovery

`required` is removed from the model-visible input schema. Legacy calls and stored questions carrying it are accepted and ignored; it does not alter the new submission rule. Do not add it to new calls. Historical partial results remain valid legacy records.

Recovery still persists questions only, not answer drafts. It restores the newest unresolved call on the active branch and applies the same new UI rules and version 2 serializer. Submit/cancel persist dismissal to prevent reopening; only submit sends a user message.

## Reading legacy results

`LegacyAskResult` has no `version`. Read it with its old global `mode` and optional `continuation`/`elaboration`. Legacy submit allows partial and note-only answers; legacy elaborate carries committed answers plus separate clarification context. Preserve those answers and unanswered states as recorded. Do not convert global mode or note presence into per-question intent, or retroactively apply v2 submission/cancellation invariants. The legacy display path is read-only.

Check the discriminator before consuming results: `version === 2` is the new format; absent `version` plus a valid legacy shape is the old format. Unknown versions and malformed data use a safe invalid-result fallback, never the successful v2 display.

The remote submission boundary remains on the legacy protocol and result serializer until its follow-up ticket. It does not infer per-question intent. The unchanged `@eko24ive/pi-ask:*` event contract is described in [remote-events.md](remote-events.md).

## Config upgrade

Config schema 9 adds `main.toggleElaborate: ["e"]`. Versions 1–8 migrate in memory, preserving existing valid settings/bindings and adding missing actions. A collision, including one introduced by migration, warns and replaces the full keymap with defaults for the session while retaining valid behaviour and notification settings. Loading never writes or creates a file; absent current/legacy config uses built-in defaults in memory until an explicit save, which uses schema 9. The removed auto-submit field still blocks loading until manually deleted. See [configuration.md](configuration.md).
