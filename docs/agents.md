# Agents in Spool

The agent rail runs the agent you already use: **Claude Code**, **Codex** or
**pi**. Spool ships no agent of its own. The agent menu picks the agent
a new chat starts on, and that choice applies to every project on this machine;
existing threads keep their agent and history.

## Installation requirements

The npm package needs Node 22.19 or later and runs on macOS or Linux. On Windows,
run it inside WSL. The Apple silicon Mac app needs macOS 14 or later and includes
its own Node runtime, but not an agent.

Install at least one agent and sign in to it in a terminal, the way you normally
would:

| Agent | Install | Sign in |
| --- | --- | --- |
| Claude Code | `npm i -g @anthropic-ai/claude-code` | run `claude`, then `/login` |
| Codex (0.151.0 or later) | `npm i -g @openai/codex` | run `codex login` |
| pi | `npm i -g @earendil-works/pi-coding-agent` | run `pi`, then `/login` |

Spool finds each agent by its command on `PATH`. With none installed, the rail
shows these install lines with copy buttons, and looks again when you press
Check again or come back to the window.

Use Chrome for the browser canvas. Automated browser checks use Spool's installed
Playwright package; `spool skill verbs` gives the package location and browser
setup command for that installation. The Mac app includes Chromium for its
canvas and player windows.

## Accounts and models

Each agent uses its own login, models and settings. Spool stores no
credentials and never asks for a key. The model menu lists what the agent
reports on this machine: for Codex, every model it lists with the reasoning
efforts it reports for that model; for pi, every model it has a login or key for, with
models served from this computer (Ollama, LM Studio and the like) marked
**local**, and each model's own thinking levels.

## Permissions

The footer's permission menu applies to every project on this machine. Claude
Code maps its three modes to its default, accept-edits and bypass-permissions
modes; design file edits never ask. A mode picked mid-turn applies from the next
turn.

Codex maps them to its own approval policy and sandbox:

| Mode | Codex approval policy and sandbox |
| --- | --- |
| ask | `untrusted`, `workspace-write` |
| edits | `on-request`, `workspace-write` |
| bypass | `never`, `danger-full-access` |

Under ask and edits, Spool turns on network access inside Codex's sandbox so
`spool` verbs can reach the local daemon; Codex has no loopback-only setting.
Writes inside `design/` and read-only `spool` verbs are approved without asking;
everything else Codex asks about reaches the rail. Whether Codex trusts the
project is your own Codex setting: Spool sets none and does not write Codex's
`config.toml`. A turn on a Codex older than 0.151.0, the
first release that resumes a thread without loading its whole history, stops
before it starts and says to update it.

pi never asks before it acts, so a pi chat shows no permission menu. Spool asks
pi to say what it is about to change outside `design/` before it does it.

Stop cancels the active work. Closing or refreshing the canvas does not stop a
turn owned by the daemon.

## Designers

Every agent gets a designer from Spool. When you ask for options or several
directions, the agent gives each direction to its own designer with a brief, and
the rail shows one row per designer with what it is doing now. A single edit the
agent makes itself.

Spool hands the designer to the agent on each turn from its own state. It is
never written into your project or into Claude Code's, Codex's or pi's own
config: Claude Code gets it as `--agents`, Codex as an agent role in `-c`
flags, and pi as an extension loaded with `-e`. A designer runs on the same
agent, model and effort as the chat that called it.

## Existing conversations

Claude Code, Codex and pi threads continue in the agent's own saved session. If the
agent or its session is missing, the thread's history stays readable; install
or sign in to the agent and use check again, or start a new thread.

Threads from Spool's former built-in agent stay readable and can't be
continued. A message sent in one starts a new chat on your current agent.
