# pi-ask configuration

This file is the source of truth for configuring `@jopqior/pi-ask`.

When changing pi-ask settings:

1. Edit the config file.
2. Validate keymaps against the rules below.
3. Run `/reload` or restart pi so the new config is picked up.

pi-ask treats this file as user-owned config. It does not rewrite or back up the file just because it was loaded, migrated, or found invalid. Settings toggled in `/ask-settings` are saved only when the file is writable; if saving fails, pi-ask reverts the toggle and shows the config path to edit manually.

## Config file path

Default path:

`~/.pi/agent/extensions/eko24ive-pi-ask.json`

If neither the current nor legacy config file exists, pi-ask uses built-in defaults in memory. Loading never creates a config file; only an explicit save (for example, changing a setting or confirming reset) writes it. If saving fails because the location is read-only or externally managed, disk stays unchanged and the settings change is reverted.

Older pi-ask versions wrote this file at `~/.pi/agent/eko24ive-pi-ask.json`. If that legacy file exists and the extensions config does not, pi-ask reads the legacy file as a fallback and leaves disk unchanged. If both files exist, pi-ask uses the extensions config and leaves the legacy root file untouched.

## Config versions and migrations

`schemaVersion` identifies the persisted config shape; the current version is `9`. Before migration, pi-ask rejects any config containing `behaviour.autoSubmitWhenAnsweredWithoutNotes`, even when its value is `false`, `null`, or another non-boolean value. Ask is blocked in every mode, including interrupted-form recovery; it does not fall back to defaults. The error names the actual config file (including a legacy fallback file) and requires you to manually remove the field, then run `/reload` or restart pi. Loading leaves the file unchanged.

Once that field is absent, versions `1`–`8` migrate in memory before validation, preserving other settings and adding missing defaults while discarding the obsolete `answer` section from versions `1`–`5`. Version `6` gains `main.editCustomAnswer: ["c"]` only when that action is missing; existing bindings are preserved. Version `8` gains `main.toggleElaborate: ["e"]` only when missing, also preserving existing bindings. Loading never rewrites the file; an explicit save writes version `9`.

Other unsupported future versions or invalid files are left unchanged and defaults are loaded for the current session. Fix the file, then run `/reload` or restart pi.

## Config shape

```json
{
  "schemaVersion": 9,
  "behaviour": {
    "confirmDismissWhenDirty": true,
    "doublePressReviewShortcuts": true,
    "presentSingleAsMulti": false,
    "showFooterHints": true
  },
  "keymaps": {
    "global": { "dismiss": ["ctrl+c"], "settings": ["?"] },
    "main": {
      "confirm": ["enter"],
      "cancel": ["esc"],
      "toggle": ["space"],
      "changeQuestionType": ["t"],
      "editCustomAnswer": ["c"],
      "toggleElaborate": ["e"],
      "nextTab": ["tab", "right"],
      "previousTab": ["shift+tab", "left"],
      "nextOption": ["down"],
      "previousOption": ["up"],
      "optionNote": ["n"],
      "questionNote": ["shift+n"]
    },
    "editor": {
      "submit": ["enter"],
      "close": ["esc"],
      "nextTabWhenEmpty": ["tab", "right"],
      "previousTabWhenEmpty": ["shift+tab", "left"],
      "nextOptionWhenEmpty": ["down"],
      "previousOptionWhenEmpty": ["up"]
    },
    "noteEditor": {
      "save": ["enter"],
      "close": ["esc"],
      "nextTabWhenEmpty": ["tab", "right"],
      "previousTabWhenEmpty": ["shift+tab", "left"],
      "nextOptionWhenEmpty": ["down"],
      "previousOptionWhenEmpty": ["up"]
    },
    "settingsModal": {
      "close": ["esc", "ctrl+c", "?"],
      "nextOption": ["down"],
      "previousOption": ["up"],
      "toggle": ["enter", "space"]
    }
  },
  "notifications": {
    "enabled": true,
    "channels": ["bell"]
  }
}
```

## Behaviour

Answering the final question always opens Review. Submission requires an explicit review action and a valid answer for every question; there is no auto-submit setting. Review offers only Submit and Cancel. Tentative answers count when they contain a valid selection or selected nonblank custom answer; notes or Elaborate alone do not. Review labels questions `Answered`, `Tentative · Elaborate`, or `Unanswered`, and keeps the missing-answer warning visible while any question is unanswered. Cancelling is not blocked by missing answers.

### `behaviour.confirmDismissWhenDirty`

- type: boolean
- default: `true`
- effect: when enabled, discarding a dirty ask flow requires a second cancel/dismiss action
- the warning stays visible until the user changes tabs in the ask flow
- dirty means there are saved answers/notes or unsaved editor draft text

### `behaviour.doublePressReviewShortcuts`

- type: boolean
- default: `true`
- effect: when enabled, review-tab `1` (Submit) and `2` (Cancel) only trigger after pressing the same key twice; `3` has no action
- the review screen shows an inline hint and keeps the pending shortcut armed until another review shortcut is pressed or the user leaves the tab

### `behaviour.presentSingleAsMulti`

- type: boolean
- default: `false`
- effect: future ask flows render requested `single` questions as `multi` questions
- result: the question keeps `type: "single"` and adds `presentedType: "multi"`; result text uses one compact note when any answered questions were presented differently
- scope: this is a default presentation policy for new/recovered ask flows; it is not hot-applied to the current ask flow
- current-flow override: use the configurable main-flow `changeQuestionType` hotkey (default `t`) to change the active question type live: non-preview questions toggle `single <-> multi`; preview questions toggle `preview <-> multi`
- destructive confirmation: changing `multi -> single` with multiple selected answers requires pressing the type hotkey again; the pending confirmation has no timeout and clears when another navigation/action is used

### `behaviour.showFooterHints`

- type: boolean
- default: `true`
- effect: when disabled, the ask flow hides the footer keymap hints

## Notifications

Notifications are best-effort external alerts emitted once per ask session, when the ask UI opens and is waiting for input.

### `notifications.enabled`

- type: boolean
- default: `true`
- effect: enables or disables external ask notifications
- settings UI: this is the only notification field toggled individually by `/ask-settings` or `?` in the ask flow

### `notifications.channels`

- type: array
- default: `["bell"]`
- supported channels:
  - `"bell"` writes BEL (`\u0007`)
  - `"osc9"` writes an OSC 9 terminal notification
  - `"osc777"` writes an OSC 777 title/body notification
  - `{ "type": "command", "command": string }` runs a shell command
- effect: channels run in order; failures are ignored and never fail the ask flow
- invalid channels are skipped; if none are valid, pi-ask falls back to `["bell"]`

Notification text:

```txt
Question waiting: <label or prompt>
```

Command channels receive these environment variables:

```sh
ASK_NOTIFY_EVENT=question.waiting
ASK_NOTIFY_TITLE="pi ask"
ASK_NOTIFY_MESSAGE="Question waiting: <label or prompt>"
```

cmux example:

```json
{
  "type": "command",
  "command": "cmux notify --title \"$ASK_NOTIFY_TITLE\" --body \"$ASK_NOTIFY_MESSAGE\""
}
```

## Keymaps

`keymaps` is context-aware. Each action accepts either one key id string or an array of key id strings.
Arrays are aliases: any listed key triggers the same action.

### Defaults

```json
"keymaps": {
  "global": {
    "dismiss": ["ctrl+c"],
    "settings": ["?"]
  },
  "main": {
    "confirm": ["enter"],
    "cancel": ["esc"],
    "changeQuestionType": ["t"],
    "editCustomAnswer": ["c"],
    "toggleElaborate": ["e"],
    "toggle": ["space"],
    "nextTab": ["tab", "right"],
    "previousTab": ["shift+tab", "left"],
    "nextOption": ["down"],
    "previousOption": ["up"],
    "optionNote": ["n"],
    "questionNote": ["shift+n"]
  },
  "editor": {
    "submit": ["enter"],
    "close": ["esc"],
    "nextTabWhenEmpty": ["tab", "right"],
    "previousTabWhenEmpty": ["shift+tab", "left"],
    "nextOptionWhenEmpty": ["down"],
    "previousOptionWhenEmpty": ["up"]
  },
  "noteEditor": {
    "save": ["enter"],
    "close": ["esc"],
    "nextTabWhenEmpty": ["tab", "right"],
    "previousTabWhenEmpty": ["shift+tab", "left"],
    "nextOptionWhenEmpty": ["down"],
    "previousOptionWhenEmpty": ["up"]
  },
  "settingsModal": {
    "close": ["esc", "ctrl+c", "?"],
    "nextOption": ["down"],
    "previousOption": ["up"],
    "toggle": ["enter", "space"]
  }
}
```

### Contexts

- `global`: active in the main ask flow and editors; duplicates with those contexts are invalid
- `main`: question and review flow
- `editor`: custom answer editor
- `noteEditor`: question/option note editor
- `settingsModal`: `/ask-settings` and `?` settings overlay

### `main.editCustomAnswer`

- default: `["c"]`
- shown and active only when the custom row has focus and contains saved text
- effect: reopens that text in the custom-answer editor
- empty custom rows open automatically on digit/Up/Down focus; saved rows do not
- Enter saves and stays on the custom row; a second Enter confirms/advances without replacing the text
- inside editors, `c` remains ordinary text; editor navigation and file completion are unchanged
- applies to question tabs, not the review tab

### `main.toggleElaborate`

- default: `["e"]`
- shown and active on question tabs, not Review; the question displays `Elaborate: on` or `Elaborate: off`, even without notes
- effect: explicitly toggles the active question between ordinary (`answer`) and tentative (`elaborate`) intent, even without notes
- selection, notes, custom-answer editing, navigation, and question-type changes leave intent unchanged
- inside answer and note editors, `e` is ordinary text

### Allowed bindings

Each action accepts any `pi-tui` key id string, as long as it is:

- supported by `pi-tui`
- not a fixed numeric shortcut (`1` through `9`)
- not duplicated within the same context
- not duplicated between `global` and `main`, `editor`, or `noteEditor`

Examples of valid bindings:

- `esc`
- `ctrl+c`
- `space`
- `enter`
- `n`
- `shift+n`
- `alt+f7`
- `ctrl+[` 
- `ctrl+shift+p`
- `super+k`

### Accepted alias normalization

Common aliases are normalized to canonical `pi-tui`-style strings.

Examples:

- `escape` -> `esc`
- `return` -> `enter`
- `control+c` -> `ctrl+c`
- `Shift+N` -> `shift+n`
- `pageup` -> `pageUp`
- `pagedown` -> `pageDown`

### Fixed bindings

These are intentionally not configurable:

- `1..9` triggers option/review shortcuts
- when `behaviour.doublePressReviewShortcuts` is enabled, review-tab shortcuts `1` (Submit) and `2` (Cancel) require the same key twice; `3` has no action
- `@` remains the file-reference affordance in editors

## Invalid keymaps behavior

If configured keymaps are invalid:

- valid `behaviour` and `notifications` settings still load
- invalid `keymaps` fall back to default keymaps for the current session
- ask remains usable
- a warning notice is shown
- the config file is left unchanged
- after fixing the file, run `/reload` or restart pi

This also applies when migration adds `main.editCustomAnswer: ["c"]` or `main.toggleElaborate: ["e"]` and the new key conflicts with an existing `main` or `global` binding. The whole keymap falls back to defaults, rather than silently remapping either action.

Invalid keymaps include:

- missing one of the required contexts or actions
- unsupported key syntax
- duplicate bindings within one context
- duplicate bindings between `global` and `main`, `editor`, or `noteEditor`
- use of fixed numeric shortcuts (`1` through `9`)

## Example custom config

```json
{
  "schemaVersion": 9,
  "behaviour": {
    "confirmDismissWhenDirty": true,
    "doublePressReviewShortcuts": true,
    "presentSingleAsMulti": false,
    "showFooterHints": false
  },
  "keymaps": {
    "global": {
      "dismiss": ["ctrl+c"],
      "settings": ["?"]
    },
    "main": {
      "confirm": ["ctrl+k"],
      "cancel": ["q"],
      "toggle": ["ctrl+t"],
      "changeQuestionType": ["t"],
      "editCustomAnswer": ["c"],
      "toggleElaborate": ["e"],
      "nextTab": ["tab", "right"],
      "previousTab": ["shift+tab", "left"],
      "nextOption": ["down"],
      "previousOption": ["up"],
      "optionNote": ["x"],
      "questionNote": ["shift+x"]
    },
    "editor": {
      "submit": ["ctrl+k"],
      "close": ["q"],
      "nextTabWhenEmpty": ["tab", "right"],
      "previousTabWhenEmpty": ["shift+tab", "left"],
      "nextOptionWhenEmpty": ["down"],
      "previousOptionWhenEmpty": ["up"]
    },
    "noteEditor": {
      "save": ["ctrl+k"],
      "close": ["q"],
      "nextTabWhenEmpty": ["tab", "right"],
      "previousTabWhenEmpty": ["shift+tab", "left"],
      "nextOptionWhenEmpty": ["down"],
      "previousOptionWhenEmpty": ["up"]
    },
    "settingsModal": {
      "close": ["esc", "ctrl+c", "?"],
      "nextOption": ["j", "down"],
      "previousOption": ["k", "up"],
      "toggle": ["enter", "space"]
    }
  },
  "notifications": {
    "enabled": true,
    "channels": [
      {
        "type": "command",
        "command": "cmux notify --title \"$ASK_NOTIFY_TITLE\" --body \"$ASK_NOTIFY_MESSAGE\""
      }
    ]
  }
}
```

## Agent editing rule

When editing this config for a user:

- preserve unrelated fields
- manually remove `behaviour.autoSubmitWhenAnsweredWithoutNotes` if present; changing its value to `false` does not unblock ask
- set `schemaVersion` to `9` and remove the obsolete `answer` section when saving an older config
- add `main.editCustomAnswer` when missing; use `["c"]` unless it conflicts with another binding, in which case ask the user which key to use
- add `main.toggleElaborate` when missing; use `["e"]` unless it conflicts with another binding, in which case ask the user which key to use
- do not assign fixed numeric shortcuts (`1` through `9`) to configurable actions
- do not create duplicate bindings within a context or between `global` and `main`, `editor`, or `noteEditor`
- preserve existing `notifications.channels` unless the user asks to change notification targets
- only toggle `notifications.enabled` unless the user asks to configure channels
- use the settings reset action only when the user explicitly asks to restore pi-ask defaults
- use a `cmux notify` command channel when the user asks for cmux notifications
- after changing the file, tell the user to run `/reload` or restart pi
