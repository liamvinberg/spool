# #163 · Prototype comments in the browser for viewers and outsiders

- State: closed (resolved)
- Labels: wayfinder:prototype
- Parent: #155
- Blocked by: #158, #159, #162
- Tasks: task 188 (■ #163 Prototype comments in the browser for viewers and outsiders)
- Created: 2026-10-18T17:43:57.028Z
- Updated: 2026-10-20T05:21:12.808Z
- Closed: 2026-10-20T05:21:12.808Z

## Question

The browser canvas at spool.page has a pages rail and no panes or canvas tools. How does a viewer or an outsider leave and read comments there: does it gain a comment tool and a comments list, and how close to the Mac app's take? What does an outsider see first, and what does signing in to comment look like for someone with only a link?

Plane: SPOOL-163

## Comments

### agent, 2026-10-20T05:09:42.128Z

Progress, task 188: the prototype is drawn in `design/frames/explore/cloud/comments-browser/` on the team canvas (code: `shared/ui/explore/cloud-comments/browser.tsx`, beside the Mac's). Two takes for where commenting lives in the browser: `browser-tools` (a Pointer + Comment tool group, a Comments panel from a button by Shared; recommended) and `browser-rail` (a comments tab in the rail, a labelled Comment button). Two for signing in with only a link: `sign-in-at-send` (write first, sign in inside the card when sending, then the #159 name step; recommended) and `sign-in-first` (a dialog when picking the tool). Signed-out visitors read their share's comments. Waiting on Cata's picks.

### agent, 2026-10-20T05:21:07.190Z

## Resolution

Decided with Liam (Cata), 2026-10-20, agent-hub task 188. The prototype is `design/frames/explore/cloud/comments-browser/` on the team canvas (`browser-tools` and its states, `sign-in` and its states), with code in `shared/ui/explore/cloud-comments/browser.tsx` beside the Mac's. The losing takes, `browser-rail` (a comments tab in the rail and a labelled Comment button) and `sign-in-at-send` (write first, sign in when sending), were deleted. spool.page's history keeps them.

- **Commenting in the browser follows the Mac, cut down to what the browser does.** A tool group of two at the bottom: Pointer (today's browser: a click plays a frame, a drag pans) and Comment (tap C to switch, hold C to borrow, V or Esc to leave). There is no Hand, because a drag already pans. A comment opens as the Mac's card at its pin. Shift+C hides pins. Members get the Mac's composer (audience picker, element chip). Outsiders get no picker: the composer says their share and the team read it. They see the outline of the element under the pointer, but never its tag.
- **The list** is the Mac's Comments inbox, as a panel that slides in on the right. It opens from a Comments button beside Shared, which shows the open count and an unread dot. Choosing the tool does not open it.
- **Placing a pin hands back the Pointer.** The cursor is a normal cursor again while you write and send: one pin per pick. This holds on the Mac too, and its prototype now does it (a held C still returns to the tool you had).
- **Signing in copies Figma.** A link share opens without an account, as it ships today, but comments need one, for reading as well as writing. Signed out, no pins show and the Comments button has no count. Each of these opens one sign-in dialog ("Sign in to see comments"): the Comment tool, C, the Comments button, the rail's Sign in, and a one-time tip over the tool on the first visit. The dialog offers Google, or an email code followed by the name step from #159, with a preview of how your comments will head. Once you're signed in, the pins pop in and whatever you reached for follows (the tool turns on, or the list opens). Esc or a click outside closes the dialog and you keep viewing. Named shares already need sign-in for everything. Figma's own rule, checked: "Anyone with the link" can view without an account, and anonymous viewers can't read or add comments.
- **Outsiders** see only their share's comments, with every reply, as #158 decided. The rail foot shows their name once they're signed in.
- **Motion**: Cata asked for every motion to be smooth. Cards grow out of their pin and shrink back into it. Pins pop in from their tip, in a ripple after signing in. The panel slides, dialog steps slide across, tips rise, and the outline follows the element under the pointer. All of it uses the theme's snap and out curves. The card motion lives in the shared `CardAt`, so the Mac prototype has it too.

### Changes to earlier decisions
- #158 said link visitors may view without signing in and must sign in to comment. Reading comments now also needs sign-in. Viewing the frames stays open.

### For the spec
- The sign-in on an onspool.page link host must reach that host, which #158 already flagged. The dialog is the one place it happens.
