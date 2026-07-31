---
"spool.page": minor
---

Breaking: play now happens on the canvas, and the player's inspector rail goes with the change.

Press play and the app's furniture dissolves — the top bar, the sidebar, the agent rail, the tools — the canvas takes the whole window, and the camera flies into the frame until it fills the screen. The canvas dims away behind it and the player takes over. The zoom crosses where the rails were instead of sliding under them, so it is one motion from the press to the prototype. `⌘esc` (`ctrl+esc` elsewhere) flies you back out, to the frame you are standing on rather than the one you started from, so if the walk moved you the canvas agrees. Every human door goes this way: `p`, `shift+enter`, the play control on a frame's label, and "Play from here".

The player fills the screen edge to edge now, the way a video player does. Bars only ever come from the frame being a different shape than your window, and a frame is never blown up past the size it was drawn at. `⌘f` fills the screen for real, and so does the control on the pill.

The player's chrome is one pill: the frame's name, restart, fullscreen, close. It shows itself once when you arrive and then gets out of the way, and it comes back when you move the pointer down to it — the way a video player's controls do — so it is never sitting on top of a prototype's own footer while you are using the prototype. The inspector rail is gone, and with it the session tape, the state and mock readouts, and the motion switch in its footer. Rewind goes with the tape and back goes with the rail; restart covers both. This is what breaks: the standalone `/play/` page a phone or an agent opens loses those controls too.

One new rule across the whole app: spool never takes a plain key from a prototype you are using. Every ordinary key belongs to the app being played, its own `esc` included, and spool's own gestures all sit behind `⌘` on a Mac and `ctrl` everywhere else.

`/play/...` is still served, unchanged, for agents and for opening a prototype on your phone. It is just no longer where a press on the canvas sends you, and refreshing mid-play returns you to the canvas, because play is not a URL.
