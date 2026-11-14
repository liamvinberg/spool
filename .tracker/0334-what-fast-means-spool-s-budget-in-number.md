# #334 · What fast means: spool's budget in numbers, and its principles

- State: closed
- Labels: wayfinder:grilling
- Parent: #333
- Created: 2026-11-13T14:47:10.947Z
- Updated: 2026-11-13T15:08:03.240Z
- Closed: 2026-11-13T15:08:03.240Z

## Question

What must the new spool be fast at, in numbers, and which few principles does every later decision answer to?

Liam: "i just want things to feel snappy fast"; "performant, things to feel snappy be fast, whilst being and feeling smooth but not like too smooth". Turn that into a budget on his m1 that a build can pass or fail: opening a project of a thousand frames to a usable picture, frame times while panning and zooming, how long a frame takes to go from picture to live, how long an agent's edit takes to show, idle CPU, memory. And the canvas sizes it must hold: how many frames is "big".

Then the principles, few enough to remember, each one able to say no to something. Candidates to test with him: fast is a feature that is measured; the core is small and everything else is an extension; an agent can do everything a person can; a person is never the test (nothing lost, nothing flickers); what an agent or a project wrote never runs with spool's own power.

Uses the numbers from "Where today's spool spends its time" when they are in, but does not wait for them: the budget is what he wants, not what today's does.

## Comments

### agent, 2026-11-13T15:08:03.240Z

**Resolved with Liam, 2026-11-13 (task 634).**

**The budget.** Liam agreed to the numbers as the bar ("sure"), with three corrections in his words: the m1 is the test machine, not what he works on ("im on a m5 myself so like we have to consider that"); "we dont have to overoptimize" for the extreme case; and the real measure is "what customers will do and see, you can see like my projects, some users may have alot of projects and we just want to get it as smooth and snappy as possible".

So:
- **The m1 is the floor.** A number that passes on the m1 (M1 Pro, 32 GiB, 120 Hz screen) passes; nothing is tuned to an m5.
- **Real sizes are the target, the extreme is a guard.** Looked up on 2026-11-13: his largest project is spool's own canvas at 856 frames, bitustream is 307, the rethink project 72. The target case is a project of about 1,000 frames: panning and zooming hold 120 frames a second on the m1. The guard case is 5,000 frames, or a selection of thousands: it stays usable, never under 60, and nothing is traded away from the target case to make it prettier.
- **Opening:** a project of 1,000 frames shows a usable picture in under a second.
- **An agent's edit** shows in under 0.3 seconds from the file being written.
- **Many projects:** the home and switching between projects cost the same with 5 projects or 200; an open project costs nothing while it is not looked at.
- **Idle is idle:** a still canvas uses no CPU to speak of.
- Every spike and, later, every build is measured against these, on captured frames, before and after.

**The principles** (the agent's summary of what Liam has said across tasks 634, 655 and 666; he corrects them when one is wrong):
1. **Fast is a feature, and it is measured.** Snappy and smooth, "but not like too smooth". A claim without a number decides nothing.
2. **A small, clean core; everything else is an extension.** "i think we can make a better core for things, keeping it clean". Reuse before a second copy.
3. **Words first.** "this new way of designing which is i guess words first into agents". The person brings taste: says what they like and don't, edits that way, iterates. An agent can do everything a person can, and a terminal agent is the equal of the built-in one.
4. **Made for people to love using.** Today's "isnt really like friendly for people". Interactions get iterated until they are right, with the Apple mindset he means: inventiveness in how well it works, not in how strange it looks. Familiar enough that someone from Figma is comfortable.
5. **Nothing is lost and nothing flickers.** A person is never the test.
6. **What an agent or a project wrote never runs with spool's own power.**
