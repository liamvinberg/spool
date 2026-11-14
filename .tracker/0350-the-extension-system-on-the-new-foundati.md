# #350 · The extension system on the new foundation

- State: open
- Labels: wayfinder:grilling
- Parent: #333
- Blocked by: #342, #344, #345
- Created: 2026-11-13T14:47:11.485Z
- Updated: 2026-11-13T14:47:11.687Z

## Question

What is an extension in the new spool, and where is the line between core and extension?

Liam: "the extensibility is i think a really nice part of spool"; the pi.dev mindset, a Raycast feel, official extensions as in VS Code, a marketplace later; "you can essentially configure spool to be for you", with "some basic core that you could just immediately use". The old plan's answer is the evidence to start from, not the answer: a folder with a data manifest and a part per place code runs, slots that are added and never reshaped, extensions that observe and never veto, nothing lost when one is off, spool's own features built only on the public API (#256, #257, the spike #259, spec #284).

Decide it again for the foundation chosen in the tickets before this one: the parts follow from where code runs, the slots from how the canvas is drawn, the trust line from what a frame is. And the order: what the core must hold before the first extension can be written.
