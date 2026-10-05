---
"spool.page": patch
---

Spool only fetches web fonts from public https addresses now. A `shared/fonts.css` that points at a plain http URL, at localhost, or at a private network address, directly or through a redirect, fetches nothing, and the daemon prints the URL and why it refused it. Fonts on public https URLs load as before.
