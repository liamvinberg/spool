---
"spool.page": patch
---

Google models work again. Every Gemini model failed the moment you sent a message, saying the request failed and to check your connection, when nothing had been sent and the connection was fine. Spool wrapped each request to read provider errors, and the Google adapter refuses a wrapper it did not make itself. Spool now leaves those requests alone.
