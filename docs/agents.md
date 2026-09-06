# Agents in Spool

The agent rail can use **spool**, included with the npm package and Mac app, or
your installed **Claude Code**. A new project starts with spool. The engine and
model menu changes the engine by starting a new conversation; existing threads
keep their engine and history.

## Installation requirements

The npm package needs Node 22.19 or later and runs on macOS or Linux. On Windows,
run it inside WSL with the Linux requirements below. The Apple silicon Mac app
needs macOS 14 or later and includes its own Node runtime. Neither installation
requires pi, Codex, OpenCode or Claude Code to use the bundled engine.

Use Chrome for the browser canvas. Automated browser checks use Spool's installed
Playwright package; `spool skill verbs` gives the package location and browser
setup command for that installation. The Mac app includes Chromium for its
canvas and player windows.

The bundled agent runs supported Spool verification commands from this
installation, one command per tool call. Other bare `spool` shell invocations
are refused instead of using another installed version. This routing guard does
not change the access granted to other shell commands.

Restricted shell commands require working OS isolation. macOS uses its built-in
sandbox. Linux and WSL need `bash`, `bubblewrap`, `socat`, `ripgrep`, and the shared
libraries used by those helpers and the bundled seccomp executable. The kernel
must permit unprivileged user and network namespaces, including creating a
loopback interface inside the network namespace. An installed helper alone does
not establish that the kernel permits these operations.

The containment CI runs on Ubuntu 22.04. An Ubuntu 24.04 runner has refused
bubblewrap's loopback setup with `Operation not permitted`; restricted-host CI
checks the approval path for that actual refusal. Other Linux distributions,
WSL kernels and local security policies can differ. Spool never installs
privileged helpers or changes kernel policy for you.

If isolation is unavailable, the rail explains that commands cannot be
restricted to `design/` on this computer. The command waits for your choice.
Deny leaves it unexecuted; allow once runs that command with your account's file
access; for this thread grants that access to subsequent commands in the same
conversation. Spool never silently switches to unrestricted execution.

## Accounts and models

The compact connection dialog supports ChatGPT and Grok sign-in, plus OpenAI,
Anthropic, Google and xAI API keys. Available models depend on the connection
and its account access. The picker includes models that accept images; a
subscription does not guarantee access to every model. GPT-6-Astra is offered
where the bundled provider and account support it.

Spool stores bundled credentials privately in its instance state directory,
separately from project files and other agent applications. It does not import
their accounts, extensions, hooks or executable settings. Canceling sign-in
does not discard the composer draft. A rejected or expired login can be renewed
from the rail. Rate-limit recovery keeps the pending request separate from the
next draft and requires the displayed continuation action.

The installed model catalog is available offline, with compatible cached model
data restored on startup. A background catalog refresh can add model data;
changing provider code or request endpoints requires a Spool update. Offline
catalog availability does not make remote inference or sign-in work offline.

## File access, commands and questions

The footer's permission menu applies to this project on this machine:

| Mode | Bundled engine behavior |
| --- | --- |
| ask | Design file edits are quiet; broader edits and command access ask. |
| edits | File edits skip approval; broader command access still asks. |
| bypass | Tool approvals and command restrictions are skipped. |

File reads and ordinary outbound web access are quiet. Some Spool-owned state
and credential paths remain protected by the file tools. Command isolation
restricts filesystem writes; it does not promise isolation from network or
application APIs. Explicitly unrestricted commands have your account's access.

An approval names its scope. Allow once covers the pending action. For this
thread covers the stated scope in that conversation; file grants and command
grants are separate. New threads and restarted hosts do not inherit these
runtime grants. Design questions always wait for an answer or dismissal,
including in bypass mode. Typing into a question is not a permission grant.

Stop cancels the active work. Closing or refreshing the canvas does not stop a
turn owned by the daemon. If the engine host crashes, the turn stops and history
remains readable. Another message can restart it; completed tools are not
automatically replayed.

## Existing Claude Code conversations

Claude Code uses its installed binary, login and user settings. The same footer
modes map to Claude's default, accept-edits and bypass-permissions modes; they
do not claim the bundled engine's OS containment. Existing Claude threads keep
their session identity, transcript, queued messages and draft. Spool does not
rewrite Claude's configuration or move those sessions into the bundled engine.

If Claude or a saved session is missing, its history stays readable. Install or
sign in to Claude and use check again, or explicitly start a new spool thread.
An engine failure never silently moves a conversation to another engine.
