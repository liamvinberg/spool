# #342 · What a frame is

- State: closed (moved to spool-next)
- Labels: wayfinder:grilling
- Parent: #333
- Blocked by: #341, #336, #354, #355
- Created: 2026-11-13T14:47:11.063Z
- Updated: 2026-11-14T10:28:43.228Z
- Closed: 2026-11-14T10:28:43.228Z

## Question

What is the thing on the canvas: code as today, a language of our own, or more than one kind?

The decision the rest hangs on. To settle with Liam, from the spike's table: whether every frame is live code (today), or whether there are kinds (say, code for prototypes and a lighter drawn kind for slides, posters and boards) and what they share; what an agent writes and reads; what a person can change by hand, and how it is written back; what a frame ships as when the design is done (today a frame is close to the React that gets built); what coming from Figma means for it; where frame code runs, and what it is never allowed to touch.

## Comments

### agent, 2026-11-13T20:40:43.650Z

**So far, from Liam (task 634, 2026-11-13), not yet resolved:**
- A design frame being a design, with code made from it afterwards, is fine ("yeah I guess above this is fine unless you think it's really bad"). His own framing of why: "for creative work though like presentations there is no porting".
- He wants a language of our own taken seriously: "we make our own language like fully, maybe inspired by rust ... dedicated to making kind of frames, that are interactive etc ... here we could build in good validation etc ... we bring good patterns from different parts of programming languages", pointing at Kit Langton's blood (announced 2026-11-07, no source public; its stated ideas: content-addressed code in a database, merging by meaning, interpreted for feedback and compiled for release, effects in types, written by agents). His doubts: "I don't know how much quality we lose", "Could we make 3d etc", "or should we just keep tsx cause it's easy to port from prototype to the application".
- The brain's reading, told to him: a frame language (small, typed, checked, for the design kind of frame), not a general-purpose language; TSX stays as the code kind; borrow from blood the checking, identity and merging by meaning, and interpreted-on-the-canvas with compiled-out-to-React.
- He had not seen the sketch (format E) when asked whether it reads right; it was shown to him in the thread. The shape of the language is his to pick, from the three takes of #354.

### agent, 2026-11-13T20:56:30.699Z

**A census of Liam's real projects (task 634, 2026-11-13), for "could all of devosurf/* be made in a frame language?"** Counted with a script over each frame file and everything it imports (`/tmp/brain-634/census/census.py`; by pattern, so read it as rough).

- spool's own canvas: 841 frames; bitustream: 307; rethink: 76.
- **Nearly every frame is built from the project's shared kit of React components** (spool's `design/shared` is 819 files and 242,000 lines; a median spool frame pulls in about 19,000 lines through its imports). That kit holds real logic: state, effects, timers, pointer tracking and dragging, keyboard handling, inputs, context, the motion library, and three.js in 12 frames.
- **The frame files themselves are mostly plain:** in spool 527 of 841 (63%) contain nothing but layout and composition of kit components; 185 of 307 in bitustream; 66 of 76 in rethink. The rest carry their own effects, timers, pointer or keyboard handling, or a canvas.

What it means: these projects are app prototypes made of real components, which is the code kind of frame. A frame language without **components** (reusable parts with parameters, defined once in a shared file) could express almost none of them as they are built; with components it could express the composition, and the question becomes how much of the kit's behaviour can be declared and how much stays code. Round two (#354) was given components, a port test on real frames from these projects, and a landing page judged on design quality, at Liam's ask: "what would need to be proven is porting maybe or trying to prototype landing pages, without any too special instructions just enough so agent understand the syntax. But if it can make good design".

### agent, 2026-11-14T09:22:23.333Z

**Liam, 2026-11-14, after the round two results (#354):** "im with that we need to port and maybe redo things to fit our language better, but like if we write our own language from scratch we should probably navigate and take inspiration from like rust, maybe. built in type safety and validation for things but for designing things, creative works, we invent ideas for this." "J is good cause it allows for components or R maybe also is components" (both have them). "Maybe this becomes something we release for others to use later." "if we made this and it worked and we could actually use it, with maybe limitations that we fix overtime, it would be really nice, if we also like had in mind to edit any element aswell, though i dont know how far cause things animate etc, so like if there is a drawer in a frame it would need to be activated to edit it i guess, so i dont know where the line goes." "if we can make presentations like the ones in spool's design/frames/explore/deck-kit/sys-alive where we ofcourse build some ux around it, i assume we build everything in rust now aswell, cause before we couldnt as it was TSX we wrote?" "we probably dont have to overengineer things so go with what you recommend, if we should explore further the syntax." On the landing pages: "all kind of shit, in my opinion ... tsx also looked like slop."

Taken as: our own language is the direction (one kind of frame, real code in boxes inside it), starting from the typed-and-braced look; syntax and features to be settled after the prior-art research (#355). Still to answer here: editing a thing in a state that is not showing (the editor lists a frame's states by name and shows the one picked, as Figma's variants; a motion is edited at its ends, not mid-flight); whether frames are drawn by the browser or a renderer of our own (#355 part C, then #344); a proof on his own landing page and the `sys-alive` deck (12 slides built from kit parts with streaming text, steps and live demo screens inside slides), which no test has ported yet.

### agent, 2026-11-14T10:28:43.228Z

Moved to spool-next#7 (what a frame is: frame kinds, the new SDK, what a hand can change). On 2026-11-14 Liam chose to build the core first with code frames; the frame language this ticket had decided on is kept as its own parked map, spool-next#16.
