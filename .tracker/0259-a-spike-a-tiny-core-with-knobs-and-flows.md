# #259 · A spike: a tiny core with knobs and flows moved onto it

- State: closed
- Labels: wayfinder:prototype
- Parent: #251
- Blocked by: #256
- Tasks: task 567 (Extension API core spike)
- Created: 2026-11-10T08:20:58.546Z
- Updated: 2026-11-10T12:58:15.682Z
- Closed: 2026-11-10T12:58:15.682Z

## Question

Does the slot list hold up in real code?

A throwaway spike, never merged: a tiny core with the slots from the slot list, and two features moved onto it as extensions, running against a real project: knobs, the easy case (a section, a frame part, a route), and flows with walk, a hard one (a canvas layer, a frame part with go and back and state of its own, daemon reads, a verb, events). The API to build against is the resolution on the slot list ticket. Judge with Liam what the API felt like to write against, what the slot list got wrong, and what the core needed that the paper missed. The answer amends the slot list.

## Comments

### agent, 2026-11-10T12:58:15.682Z

## Resolution (judged in task 557, 2026-11-10)

The spike ran and was looked at: knobs draw in the tiny core's Properties as an extension and write through core's write lane with undo; flows' arrows and walk tags draw as layers and its graph matches today's exactly; both folders import only the SDK. The API on paper held for the slots it used. What it missed was additive: a compile part, a references participant for rename, and a set of services. The full list and the contracts decided from it are the "Amendments from the spike" comment on #256; two findings went to #257. Code: branch `567-wayfinder-map-251-ticket-259-a`, `spikes/extension-core/`, kept as a reference and never merged. Not exercised: pane, tool, frame decoration, ingress, page kind, play mode, the cloud part, hand edit, team, the player.
