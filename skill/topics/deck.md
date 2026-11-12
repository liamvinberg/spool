---
summary: decks: a page that is a talk, deck.json, slides, ui.beats, ui.live, notes
experiment: deck
---

A deck is a page whose top row is a talk: a presentation made of frames. A page is a deck when its folder holds a deck.json. Its slides are ordinary frames on that page, in the order deck.json lists them; every other frame on the page is loose, a draft or a spare that rests in a grid under the talk and plays nowhere. There is no verb: a deck is files.

  frames/<talk>/deck.json             the talk: its size and its slides in order
  frames/<talk>/<slide>/frame.tsx     a slide: a frame like any other, the size of the talk
  frames/<talk>/<slide>/notes.md      what the presenter says over it, one paragraph per beat (optional)

deck.json, written with one slide per line:

  {
    "version": 1,
    "w": 1280,
    "h": 720,
    "slides": [
      "title",
      "problem",
      "close"
    ]
  }

version is 1. w and h are the talk's size in px (1280 by 720 when left out; 240 to 3840 by 240 to 2160): every slide is that size, and the room's screen scales the talk to fit it. slides names the talk's frames by their folder on this page, in the order they play. A name may come before its frame does; a name listed twice plays once.

Make a deck in this order: the page's folder (frames/<talk>/, which is the whole page), then deck.json, then the slides. Don't write a slide's frame.json: spool writes one into every frame's folder on a deck page, the talk's size and the frame's place, and rewrites it as the deck changes, so leave the one you find there. Spool places every frame of a deck by itself, slides side by side in a row at the top, loose frames in a grid under it, and keeps them there as deck.json and the page's frames change: never write x or y on a deck page, they are rewritten (this overrides topic: frames, where writing a place is fine). To reorder the talk, add a slide or take one out, rewrite slides. A slide plainly of another shape (a phone, 390 by 844) states its own w and h in frame.json and is shown fitted and centred in the talk's box, the room's dark ground around it, drawn as on the canvas; a slide of nearly the talk's shape at another size is a mistake that check names.

A slide's beats are the steps it plays in before the talk moves on: a title, then the number, then what it means. A slide names them in its frame.tsx, in a list written out in the call, and reads the beat the talk has it on:

  import { ui } from "spool";
  import { cn } from "shared/lib/utils";

  export default function Price() {
    const beat = ui.beats(["claim", "price", "date"]);
    return (
      <main className="grid h-full place-content-center gap-8 bg-stone-950 text-stone-50">
        <h1 className="text-7xl font-semibold">Sola Ring</h1>
        <p className={cn("text-5xl transition-opacity duration-500", beat.reached("price") ? "opacity-100" : "opacity-0")}>$349</p>
        <p className={cn("text-3xl transition-opacity duration-500", beat.reached("date") ? "opacity-100" : "opacity-0")}>Ships March 24</p>
      </main>
    );
  }

ui.beats(names) returns the beat: its name, its index from 0, and reached(name), true once the talk is at or past that beat. Call it in the slide's component, as ui.use() is (it is a hook), once, in frame.tsx: shared/ui components never import "spool", so pass them the beat or reached(...) as props. The list must be a literal array of distinct strings in the call itself, never a constant or a computed list: spool reads it from the source without running the slide, to show the beats before the slide has ever played. A slide with one beat leaves ui.beats out. Wherever nothing steps the talk (the canvas, a still, an ordinary play window) a slide reads as its last beat, so it shows complete: keep every element of every beat in the layout and reveal it with opacity, transform or a clip, so the last beat is the whole slide and nothing jumps when a beat arrives.

ui.live() marks a slide live; a live slide may name beats too, calling both ui.live() and ui.beats(). A live slide holds something to use while presenting, a prototype or a demo, so a click on it reaches it rather than advancing the talk, and Tab can hand it the keyboard. Call it in the slide's component. Two windows show a talk, the presenter's and the room's: they share where the talk is and ui.state, nothing else. Whatever the room must see change on a live slide lives in ui.state (topic: flows); state a component keeps to itself changes only in the window where it was used. Read it through ui.use(), which returns ui.state and draws the slide again when it changes, with its starting value as a fallback, typed by you, since ui.state's values are unknown: `const state = ui.use(); const items = (state.items as Item[] | undefined) ?? START;`, and write it only in handlers, never in the render; or seed it in a scenario (topic: scenarios). While presenting, a click on a live slide reaches it, Tab hands it the keyboard and Esc takes it back, and PageDown and PageUp still move the talk, so a clicker always works. To put a prototype on a slide, import its components into the slide and write the slide's words around them.

A person presents a talk from the canvas, with the deck's page open: ⇧⌘↵ presents from the first slide, ⌘↵ from the slide selected (Ctrl for ⌘ off a Mac), and so does the play button on a selected slide's label; the play button on the deck's row in Pages presents from the start. The presenter view takes spool's window, with the next slide, the notes and a clock, and the room's screen opens in a window of its own (in the Mac app, full screen on a second display when there is one); the room sees the presenter's pointer as a soft dot over a live slide, which L turns off and on. There is no verb for it: spool url plays one slide alone, at its last beat, and steps nothing. Hand a finished talk to a person by naming its page and these keys.

With the tiling window manager AeroSpace running, the Mac app keeps the talk's two windows out of its tiling while the talk plays and puts them back after, through AeroSpace's own aerospace command where Homebrew or Nix installed it. Someone who would rather AeroSpace never tiled spool adds `[[on-window-detected]]` with `if.app-id = 'page.spool.mac'` and `run = 'layout floating'` to its config; the room still needs that command to land on the right display, since AeroSpace moves a new window to the display in focus.

Between slides, an element two slides share travels as one object when both give it the same view-transition-name (style={{ viewTransitionName: "ring" }}), and the rest cross-fades; there is no transition setting anywhere, the slides' code is the transition. Give a name to one element per slide only.

notes.md beside a slide holds the presenter's words, plain text, one paragraph per beat in order, a blank line between two. A beat with nothing to say is a paragraph of a lone -, so the beats after it keep their place:

  Hold the ring up and wait a moment.

  -

  Orders open today and ship March 24.

A slide without ui.beats has one beat, so one paragraph. Paragraphs past the slide's last beat show with its last beat, and check warns of them. Notes are the presenter's alone: never import notes.md into a frame, and never put what the room reads in it. They travel with the slide's folder (a rename, a move, a copy, the Trash, history and sync).

Write a slide's words as literal JSX text, as every frame's (topic: frames): a person edits them by hand on the canvas, and a computed string can't be edited. A slide fills its box with h-full and lays itself out for the talk's size, never for a window: the room scales the whole slide.

A talk plays at 60 frames a second only when its slides keep up, and that is in the slide's code. Move and reveal with transform and opacity, which the screen composites, rather than left, width, top or height, which lay the page out again every frame, or shadows and filters, which repaint it. Let every animation end, unless the slide is about that motion: one that runs for ever keeps the slide drawing while the presenter talks. Give pictures about the pixels they are shown at, twice that for a sharp screen. Draw one canvas or WebGL scene per slide at most, and stop a requestAnimationFrame loop once its motion is done.

spool check, with decks on, refuses a deck.json that does not parse or lists a frame that is not on its page, a ui.beats list that is not written out or names a beat twice, and a frame importing notes.md; it warns of a slide whose size is not the talk's but nearly its shape, and of notes running past a slide's beats. Spool times every slide you edit, at rest and as each beat enters, and check notes the talk's slides that timed slow, by number, with the beat that was worst and what in the slide is likely slowing it; a note never fails check. Run it after writing a deck; `spool check <talk>` checks that page's frames alone. `spool shot` pictures each slide at its last beat, the whole slide; `spool shot <slide> --beat <name or number>` pictures it at an earlier one (`--beat 2`, `--beat price`), so check a reveal beat by beat. Make a reveal right in the code: every beat's elements in the layout from the first, each shown by reached().
