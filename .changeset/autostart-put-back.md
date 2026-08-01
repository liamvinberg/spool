---
"spool.page": patch
---

An upgrade that cannot hand the new launch agent to launchd now puts the old one back and starts it again, so start-on-login survives a failed upgrade. If putting it back also fails, spool says autostart is off and tells you to run `spool autostart`.
