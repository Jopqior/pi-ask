# Issue tracker: GitHub

Issues and specs live in `Jopqior/pi-ask`. Use the `gh` CLI.
Pass `--repo Jopqior/pi-ask` explicitly for issue and PR commands so work stays in the fork rather than upstream.

## Conventions

- Create: `gh issue create --repo Jopqior/pi-ask --title "..." --body-file -`. Supply multi-line bodies with a heredoc.
- Read: `gh issue view <number> --repo Jopqior/pi-ask --comments`. Fetch labels and filter comments with JSON/jq when needed.
- List: `gh issue list --repo Jopqior/pi-ask --state open --json number,title,body,labels,comments`. Apply appropriate label/state filters.
- Comment: `gh issue comment <number> --repo Jopqior/pi-ask --body "..."`
- Apply/remove labels: `gh issue edit <number> --repo Jopqior/pi-ask --add-label "..."` / `--remove-label "..."`
- Close: `gh issue close <number> --repo Jopqior/pi-ask --comment "..."`

## Pull requests as a triage surface

**PRs as a request surface: no.**

Set to `yes` to include external PRs in triage. When enabled, use `gh pr` equivalents and keep authors with association `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`; exclude `OWNER`, `MEMBER`, and `COLLABORATOR`.

Issues and PRs share a number space. Resolve ambiguous numbers with `gh pr view` and fall back to `gh issue view`.

## Skill operations

- "Publish to the issue tracker": create a GitHub issue.
- "Fetch the relevant ticket": read the issue with comments.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing Notes / Decisions-so-far / Fog.
- Child ticket: link as a GitHub sub-issue using `gh api`. If unavailable, use a task list in the map and `Part of #<map>` in the child.
- Child labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native issue dependencies:
  `gh api --method POST repos/Jopqior/pi-ask/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the database ID with `gh api repos/Jopqior/pi-ask/issues/<number> --jq .id`.
  If dependencies are unavailable, put `Blocked by: #<number>` at the top of the child body.
- Frontier: inspect open map children in map order; exclude assigned tickets and tickets with open blockers. Native `issue_dependencies_summary.blocked_by > 0` indicates an open blocker.
- Claim: `gh issue edit <number> --repo Jopqior/pi-ask --add-assignee @me`, the session's first write.
- Resolve: comment with the answer, close the child, then append a gist and link to the map's Decisions-so-far.
