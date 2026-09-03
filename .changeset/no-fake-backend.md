---
"spool.page": minor
---

Breaking: the fake backend is gone. A frame's relative `fetch` no longer answers out of `shared/fixtures/`, scenarios no longer carry a `mock` object, and `spool init` no longer scaffolds a fixtures folder. Across every project the canvas had been used on, no fixture was ever written and no scenario ever declared a route: what an app knows lives in `ui.state`, seeded by the scenario and written by the frame. A scenario is now `{ "state": { ... } }`; a file still carrying an empty `mock` key keeps loading, its `mock` ignored.
