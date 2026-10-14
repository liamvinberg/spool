---
"spool.page": patch
---

When spool.page drops everyone at once, after a deploy or under load, daemons and open team canvases no longer all reconnect in the same second. Each waits a random time that doubles with every failed try, up to about 30 seconds, and only starts again from about a second once its connection held for a minute.
