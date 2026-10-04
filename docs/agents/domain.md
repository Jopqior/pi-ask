# Domain Docs

## Layout and reading rules

This repo uses a single-context layout:

- `GLOSSARY.md` at the repo root: read before exploring domain concepts.
- `docs/adr/`: read decisions relevant to the area being explored.

If either is absent, proceed silently. Do not suggest creating them upfront.
The domain-modeling skill creates them when terms or decisions are resolved.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and test names.
Avoid synonyms the glossary explicitly rejects.

If a needed concept is missing, reconsider whether it belongs to the domain.
Record genuine gaps for domain-modeling.

## ADR conflicts

Explicitly identify proposals that contradict an existing ADR, including
the ADR reference and the reason to reopen the decision.
