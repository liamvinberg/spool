---
"spool.page": patch
---

The agent's questions are asked one at a time. A call that carries two or three of them used to send the first thing you clicked and drop the rest, so the agent got one answer where you had been shown several decisions. Now a pick settles its question, the next one appears, and the whole set goes up together.

Dismissing a question no longer breaks the session. Spool was refusing with an empty message, which the API rejects, and the failure came back on every message after it rather than just that one.
