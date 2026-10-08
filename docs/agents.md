# Agents in Spool

The agent rail runs the agent you already use: **Claude Code** or **pi**, with
Codex to follow. Spool ships no agent of its own. The agent menu picks the agent
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
| Codex | `npm i -g @openai/codex` | run `codex`, then sign in |
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
reports on this machine: for pi, every model it has a login or key for, with
models served from this computer (Ollama, LM Studio and the like) marked
**local**, and each model's own thinking levels.

## Permissions

The footer's permission menu applies to every project on this machine. Claude
Code maps its three modes to its default, accept-edits and bypass-permissions
modes; design file edits never ask. A mode picked mid-turn applies from the next
turn.

pi never asks before it acts, so a pi chat shows no permission menu. Spool asks
pi to say what it is about to change outside `design/` before it does it.

Stop cancels the active work. Closing or refreshing the canvas does not stop a
turn owned by the daemon.

## Existing conversations

Claude Code and pi threads continue in the agent's own saved session. If the
agent or its session is missing, the thread's history stays readable; install
or sign in to the agent and use check again, or start a new thread.

Threads from Spool's former built-in agent stay readable and can't be
continued. A message sent in one starts a new chat on your current agent.
