# #79 · Phones: the shared-link shell and the team canvas navigator

- State: open
- Labels: ready-for-agent
- Blocked by: #78
- Created: 2026-10-18T17:43:56.060Z
- Updated: 2026-10-18T17:43:59.442Z

## Parent

#62

## What to build

A shared link carries a name, an icon, a web app manifest, `theme-color` and `apple-mobile-web-app-status-bar-style: black-translucent`; no width cap on phones; a fixed iframe at `100vh` so the frame fills the screen from the Home Screen; the frame gets the real safe-area insets and pads itself. In a phone browser only, once, a card says who shared it, when it last changed, how to add it to the Home Screen, and "Open it here". A team canvas link on a phone gives the navigator instead of the spatial canvas: recent (latest frames, who saved each, when; live saves as a toast), the pages a level at a time with breadcrumbs and frame counts, find over page and frame names, frames as covers. Play grows the frame out of its cover full screen; a pull from the right edge leaves; turning the phone plays a desktop frame at its authored size scaled, and upright shows it whole and small with its size and "turn the phone".

## Acceptance criteria

- [X] At phone size the manifest, icon, meta tags and full-height iframe are present, and the frame receives safe-area insets
- [X] The first-open card shows once and never blocks
- [X] The navigator's recent, tree and find work on a 100+ page project
- [X] Play, the edge pull and rotation behave as described
- [ ] Checked on a real iPhone by Liam

## Blocked by

- #78

*From Linear DEV-194.*

Related: #62, #3

Plane: SPOOL-79

## Comments

### agent, 2026-10-18T17:43:59.430Z

**Liam, 2026-10-06:** Shipped in spool.page 0.31.0, live on beta.spool.page and spool.page. It stays In Progress for one thing only Liam can do: the check on a real iPhone.

Decisions where the spec was silent:
- A phone is a touch screen with no hover and a short side under 600 px. Tablets get the desktop canvas.
- A link share plays straight into its prototype. Outsiders get no navigator.
- The first-open card shows only on link shares, once per share address, with nothing dimmed behind it. A people share gets the full-screen frame with no card and no Home Screen app, since that would lose the sign-in.
- 100dvh in the browser, 100vh from the Home Screen.
- Recent reads the last 500 saves and shows at most 12 frames.
- Motion across walks (story 55) isn't built.

For Liam, after the steps in t194.md. Use a team project with a phone frame that pads with env(safe-area-inset-\*), a desktop-sized frame, and a link share of a page with both.
1. Open the link share in Safari. It fills the screen edge to edge. The card says who shared it and when, shows the Add to Home Screen steps, and has "Open it here". Taps reach the prototype above it. After "Open it here" and a reload, the card stays gone.
2. In Safari, the frame's content clears the notch and the home bar.
3. Add it to the Home Screen. Spool's icon and the project's name. No browser bars, and the frame fills down to the home bar with its own padding.
4. Walk through it, close and reopen: it opens where you left off. A second shared page added the same way is a second app.
5. On spool.page//, signed in: recent shows who saved what, pages go a level at a time with counts, find works without zooming, covers show.
6. Tap a phone frame. It grows to full screen and clears the notch and home bar. Pull from the right edge to leave; a short pull springs back.
7. Tap a desktop frame. Upright it is small with "1440 × 900 · turn the phone". Turned, it fills the screen.
8. A teammate saves from their Mac. A toast shows within a couple of seconds, and show plays it.

The risk to watch: Chrome gives frames from another site no safe areas. If the iPhone does the same in steps 2 and 6, the frame's origin and sandbox need a decision.

### agent, 2026-10-18T17:43:59.442Z

**Liam, 2026-10-11:** Its spec, Spec: the cloud compiles, serves and shares (#62), closed on 2026-10-11 (agent-hub task 123). The one thing left here is Liam's check on a real iPhone.
