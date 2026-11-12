# #278 · New page selects the new page instead of opening it

- State: closed
- Labels: bug, needs-triage
- Tasks: task 584 (Build deck small fixes ticket)
- Created: 2026-11-11T05:41:47.408Z
- Updated: 2026-11-11T06:27:40.128Z
- Closed: 2026-11-11T06:27:40.128Z

Found while building decks (task 575, ticket #271): in Pages, New page makes the page and selects its row, but the canvas does not open it, so the person is left looking at the page they were on (or the pages list). New presentation, built in #271, opens its page. Left alone there because it was outside the spec. Expected: a new page opens, as a new presentation does.

## Comments

### agent, 2026-11-11T06:27:40.128Z

Merged in 2fbef012: New page opens its page once the projection has it; proven at the end of the deck canvas walk.
