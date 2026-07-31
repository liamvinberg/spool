---
"spool.page": minor
---

Play now happens on the canvas. It no longer opens a tab.

Press play and the camera flies into the frame until it fills the screen, the canvas dims away behind it, and the player takes over. `⌘esc` (`ctrl+esc` elsewhere) flies you back out, to the frame you are standing on rather than the one you started from, so if the walk moved you the canvas agrees. Every human door goes this way: `p`, `shift+enter`, the play control on a frame's label, and "Play from here".

The player fills the screen edge to edge now, the way a video player does. Bars only ever come from the frame being a different shape than your window, and a frame is never blown up past the size it was drawn at. `⌘f` fills the screen for real, and so does the control on the pill.

The player's chrome is one pill: the frame's name and size, restart, fullscreen, close. The inspector rail is gone, and the session tape with it. Rewind is gone too; restart covers it.

One new rule across the whole app: spool never takes a plain key from a prototype you are using. Every ordinary key belongs to the app being played, its own `esc` included, and spool's own gestures all sit behind `⌘` on a Mac and `ctrl` everywhere else.

`/play/...` is still served, unchanged, for agents and for opening a prototype on your phone. It is just no longer where a press on the canvas sends you, and refreshing mid-play returns you to the canvas, because play is not a URL.
