---
"spool.page": minor
---

Play opens a browser tab again, and the played page is a real page.

`p`, `shift+enter`, the play control on a frame's label and "Play from here" all open the frame in a new tab. The inline flight, the floating pill and the canvas's play state are gone, so zooming on the canvas is navigation again and nothing more.

A played frame is now a document the browser owns rather than a scaled picture. The page lays out at the real viewport width, capped at the frame's authored width: 1440 means 1440 and never more, and a 390 frame is a phone-width column centred on the page's background. Below the cap the frame's own CSS is in charge. Breakpoints fire, padding compresses, columns stack, and a frame that makes no accommodation overflows sideways exactly as that site would in production. Height is unconstrained: the page is as tall as its content and the browser scrolls it. Nothing is scaled to rescue a layout, because the rescue lies to the CSS.

Chrome is nothing, by default. The tab title carries the frame and the project, and closing the tab is the exit everyone already knows. Rest the cursor against the top edge of the window for a moment and a bar peels in with back to canvas, a frame switcher and close. A small nub at the edge is its resting trace. Passing through on the way to the browser's own chrome never reveals it, and moving back down into the page hides it at once. On touch there is no chrome at all.

The URL follows the walk. Every screen you land on names itself in the address bar, browser back and forward walk the session, a refresh reopens where you left off, and any moment is a link you can copy and send.

Restart and fullscreen lose their buttons. The session is the page, so reloading the tab restarts it and re-reads the scenario, and the browser's own fullscreen fills the screen.
