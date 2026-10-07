---
"spool.page": minor
---

`spool login` works on Linux and over SSH. When there is no browser on the machine, it prints the sign-in link instead. Open it on your phone or laptop and sign in. The browser then lands on a 127.0.0.1 page that won't load. Paste that page's address back into the terminal and you're signed in. `--no-browser` asks for this on a Mac too. Away from a Mac, the session is kept in a file only you can read in spool's state folder, so sharing and team sync work there too.
