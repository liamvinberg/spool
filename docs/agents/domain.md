# Domain docs

Spool uses a single-context domain-doc layout.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read ADRs under `docs/adr/` that touch the area being changed.
- If either is absent, proceed without creating documentation that merely restates the code.

## Vocabulary

Use the terms defined in `CONTEXT.md` in issues, specs, test names, and implementation work. If a needed concept is absent, prefer the vocabulary already established by the implementation and nearest tests rather than inventing a synonym.

## ADR conflicts

Surface any conflict with an existing ADR explicitly instead of silently overriding it.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```
