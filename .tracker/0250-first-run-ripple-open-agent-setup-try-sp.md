# #250 · first run: ripple open, agent setup, try spool cloud

- State: open
- Labels: ready-for-agent
- Created: 2026-11-09T16:45:40.559Z
- Updated: 2026-11-09T16:45:40.559Z

First run of spool, built from the onboarding exploration in task 521 (design/frames/explore/onboarding). Cata picked: the ripple first open (`onboarding-small-ripple`) and the small-window setup of `onboarding-grow`. The canvas guide is left out on purpose (too pushy); what matters is getting the agent harness installed and signed in.

## Flow
1. **Open**: on a machine's first run, spool shows one small window (560x480 in the desktop app; a centred window of that size in a browser). Pressing in it plays ripple: lines of light close in on the mark along its contours, land at 4.5 s and send one ring out to the edge; then "Welcome to spool". Sound: the recorded chords plus the soft "bloom" hit as the ring leaves (Pixabay Content License, authors in comments), the picture timed on the audio clock so it lands with what is heard on any output. m mutes, reduced motion skips to the end. WebGL 2 with a plain-mark fallback.
2. **Welcome**: one line on what spool is, Continue.
3. **Agents**: Claude Code, Codex, and pi (for other providers by API key or login). Each row shows its real state (missing, installed, signed in), from a machine-level route (today's discovery routes need a project). Install runs the installer from the daemon with progress, where it can run unattended; Sign in starts the agent's own login and rechecks. Where either can't run unattended, the row shows the one command to copy. Continue once one agent is ready; Skip always there. Claude subscriptions work only through Claude Code.
4. **Try Spool Cloud** (optional): $20 a seat a month ($16 yearly), 14-day free trial for up to 10 editors, no card; Start trial uses the existing sign-in and New team flow; Not now skips.
5. **Grow**: the small window grows into the full spool window, onto Home.

Shown once per machine (a machine setting), never again unless chosen from Help ("Run setup again"). Works on Mac, Windows and Linux: everything happens inside one ordinary window; nothing transparent.

## References
- Frames: `onboarding-small-ripple` (ripple.tsx, ripple.glsl, frame.tsx, chords.mp3.txt, hit-bloom.mp3.txt), `onboarding-grow` (frame.tsx, agents.tsx, setup.ts, band.tsx), shared `design/shared/ui/explore/onboarding/sounds.ts`.
- Today: agent detection `src/daemon/agent-preflight.ts`, engines `agent-engine-{claude,codex,pi}.ts`, routes `src/daemon/agent-routes.ts`, install commands `src/ui/canvas/agent-menu.tsx`, cloud sign-in `src/ui/account-foot.tsx`, trial `src/ui/teams.tsx`, window `desktop/src/main.ts` (no resize bridge yet; min 720x480).
