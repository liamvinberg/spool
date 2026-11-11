# #274 · Write the spec for the core and the new window

- State: open
- Labels: wayfinder:task
- Parent: #251
- Created: 2026-11-10T17:59:35.318Z
- Updated: 2026-11-10T18:18:23.825Z

## Question

No decision left: this is the writing. Turn the map's decisions into the spec and tickets for stage 2 of the build order (the resolution on "What gets rebuilt, and in what order"): the SDK and extension host on every side, the canvas core written new behind an experiment, the first features moved onto it (Pages, Properties, knobs, flows, the deck), and the compile and sync reworks.

Inputs: the slot list ticket with its amendments from the spike and the deepseek-harness notes (extension-owned sub-slots, services an extension waits for, one handle that cleans up everything an extension started, enabled versus running), "What an extension is on disk", the spike's branch `567-wayfinder-map-251-ticket-259-a`, the engine research, the sync and compile audit, what building the deck (#265) taught, and the window designs Liam picked (#258) with what they need from the API (the last comment on the slot list ticket).

Written in the brain thread (task 557) when Liam says go. Resolved when the spec and its tickets are published.
