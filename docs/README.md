# Docs

This folder keeps only the documentation needed to understand and maintain the extension without turning docs into a second copy of the code.

## Files

- `configuration.md` — source of truth for configuring pi-ask keymaps, behaviour, notifications, and config migrations
- `contract.md` — external behavior, tool payload/result details, and UX guarantees
- `interface-upgrade.md` — result version 2, input/config migration, and read-only legacy boundaries
- `remote-events.md` — legacy local inter-extension event contract, bridge examples, and smoke-test steps (remote v2 is deferred)
- `architecture.md` — module boundaries and invariants
- `../skills/ask-user/SKILL.md` — auto-bundled agent-side decision-gate guidance; enabled by default, but can be disabled via `pi config`; inspired by https://github.com/edlsh/pi-ask-user

## Reading order

- start with `configuration.md` for config-editing rules
- read `contract.md` for behavior
- read `interface-upgrade.md` when consuming results or upgrading existing integrations
- read `remote-events.md` for the still-legacy local bridge/event integration
- read `architecture.md` for code layout

## Local test run

From repo root, run:

```bash
pnpm dev
pnpm dev ../some-target-folder
```

This starts pi in isolated mode, loads only this extension and bundled `ask-user` skill, and uses the optional folder as `--cd` target.

## Rule of thumb

If a detail is about implementation mechanics, it should usually live in `src/` or `tests/`, not here.
