# Contributing

Thanks for contributing to `@jopqior/pi-ask`, a fork of [@eko24ive/pi-ask](https://github.com/eko24ive/pi-ask).

Open issues for this fork in [Jopqior/pi-ask](https://github.com/Jopqior/pi-ask/issues). If you have code to share, link your branch or fork.

## Development setup

Use Corepack and the project-only pnpm `10.34.6` pin in `package.json`'s `packageManager` field:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Install optional local commit hooks explicitly:

```bash
pnpm exec lefthook install
```

Run the extension locally:

```bash
pi -e ./src/index.ts
```

## Upstream contribution note: chill mode

The following note is from the upstream author; it describes upstream's contribution policy.

> This project is open source because I care about it, and it makes me happy when it helps people. I still cannot promise rapid reviews or a traditional pull-request turnaround.
>
> Please open an issue for ideas, bugs, and proposed changes. If you already have code, link to your fork or branch with the change set. I will review it carefully when I have time, then either incorporate the forked changes or implement the idea myself.
>
> I value contributions and will do my best to credit helpful work with a shout-out, a co-authored commit, or another fitting form of attribution.

## Validation

Before sharing a change set, please run:

```bash
pnpm format
pnpm typecheck
pnpm test
```

You can also run the read-only repo-wide check:

```bash
pnpm check
```

`pnpm format`, `pnpm lint`, and `pnpm fix` write changes.

## Commit messages

This repo uses conventional commits and semantic-release.

Recommended flow:

```bash
pnpm commit
```

Examples:

- `feat: add preview question footer hint`
- `fix: preserve option notes when toggling selection`
- `docs: clarify npm install flow`

Conventional commit types matter because releases are generated automatically from commit history.

## Fork release bootstrap

This fork publishes `@jopqior/pi-ask` with independent tags `jopqior-v${version}`, starting at `1.0.0`. Upstream tags do not define fork releases.

Before enabling CI publishing:

1. From the commit being released, confirm the package name and version are `@jopqior/pi-ask` and `1.0.0`, install with `pnpm install --frozen-lockfile`, and run validation above. Log in to npm against the official registry if needed:

   ```bash
   npm login --registry https://registry.npmjs.org/
   npm publish --access public --provenance=false --registry https://registry.npmjs.org/
   ```

   The first publish is local. Disable provenance for it because provenance is generated only in CI. Being logged in locally does not authenticate GitHub Actions.

2. Tag that same released commit `jopqior-v1.0.0` and push the tag so semantic-release has the fork's starting point.
3. In npm's settings for `@jopqior/pi-ask`, add a GitHub Actions trusted publisher with owner `Jopqior`, repository `pi-ask`, and workflow filename `release.yml`.
4. Set the GitHub repository variable `NPM_TRUSTED_PUBLISHING=true` only after the first publish and trusted publisher setup are complete. CI publishing stays disabled until this readiness flag is set.

Subsequent CI publishes use OIDC trusted publishing with provenance; no npm token is needed.

## Scope of changes

Please keep changes focused:

- state logic in plain TypeScript modules
- pi/TUI wiring thin
- tests updated when behavior changes materially
- docs updated when public behavior or usage changes materially

## Sharing changes

A useful issue with a linked fork should include:

- a clear summary of the change
- why the change matters
- tests for behavior changes
- docs updates when user-facing behavior changes
