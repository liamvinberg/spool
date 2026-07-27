# Security

## Reporting a vulnerability

Do not open a public issue.

Use [GitHub's private vulnerability reporting](https://github.com/liamvinberg/spool/security/advisories/new) on this repository, or email <vinberg.liam@gmail.com>.

Include what you did, what happened, and what you expected. A proof of concept helps but is not required to start the conversation.

This is a one-maintainer project, so expect a first response within a week rather than within a day. You will get an acknowledgement, an assessment, and a fix or an explanation of why it is not being treated as a vulnerability.

## Supported versions

Spool is pre-1.0. Only the latest published version of `spool.page` receives fixes. There are no backports.

## Trust model

Understanding this will tell you whether something you found is a bug or the design.

Spool runs a local daemon on your own machine. The daemon binds loopback only, and refuses to start on any other host: `127.0.0.1`, `localhost`, and `::1` are the only accepted values, whether they come from config or from `SPOOL_HOST`. It compiles TSX from your repository and serves it to your browser. It assumes:

- **The local machine is trusted.** Anything able to run as your user can already reach the daemon, and could read the same files directly.
- **Your repository's contents are trusted.** Spool compiles and runs code from `design/`. That code is authored by you or by an agent you invited. Spool transforms it without sandboxing it, so treat `design/` the way you treat any other code in your repo.
- **The browser is the execution boundary.** Frames run as real documents in your browser and are subject to normal browser isolation.

Spool does not install or execute your project's dependencies. `design/` is dependency-free by construction, so there is no `npm install` of frame code, ever.

### In scope

- Anything that lets a remote or non-local party reach the daemon or read project files
- Escaping the `design/` boundary to read or write files elsewhere in the repo or filesystem
- Code execution triggered by opening a project, beyond the frame code the project already contains
- Leaking file contents into responses that should not carry them
- Anything in the published `spool.page` package that behaves differently from what the docs describe in a security-relevant way

### Out of scope

- Attacks that require an attacker to already have local code execution as your user
- Frame code doing something harmful when that code is in your own repository
- Reaching the daemon through a tunnel, VPN, or proxy that you set up yourself in front of the loopback listener
- Denial of service against your own local daemon

If you are unsure which side of the line something falls on, report it. Getting a "that's the trust model" reply costs you nothing.
