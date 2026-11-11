# #258 · The open-ended window and the extensions screen

- State: closed (Liam picked on the canvas)
- Labels: wayfinder:prototype
- Parent: #251
- Blocked by: #256, #257
- Tasks: task 572 (Prototype extensions screen designs)
- Created: 2026-11-10T08:20:58.484Z
- Updated: 2026-11-10T18:15:36.312Z
- Closed: 2026-11-10T18:15:36.312Z

## Question

What does spool's window look like once anything can plug into it, and how does a person find, switch on and install extensions?

Worked with the loom skill on the team canvas, on `explore/extensions`; Liam picks there. Read first: the map's Notes, the resolution on the slot list ticket (what slots exist) and the resolution on "What an extension is on disk, who is trusted, what is on by default" (the baseline, onboarding, trust and the notice).

Liam's rule for this and every UI ticket: it is designed in spool as live frames so he sees the microinteractions. Clean, smooth, performant, not bloated. Frames that move, not static pictures of states.

Show:

- **The window at three sizes.** Baseline only (Pages, Properties, find, history, export): this is the clean default and it must look finished, not empty. With the prototype set on (flows, knobs, record, the agent pane). With a lot on: where a ninth pane goes, a sixth tool, a third properties section, an extension's commands in menus and the palette.
- **Switching one on and off**, live: what appears, where, and how it leaves.
- **The extensions screen.** Browse, switch on, add your own, in the spirit of Raycast and simple enough for someone who is not a developer. Official ones are a switch. One that is not official shows plainly that it can do anything spool can on this machine, and asks once.
- **The onboarding step.** It asks what you make (prototypes, presentations) and where your agent works, not which extensions you want.
- **The notice** when a project uses an extension that is off here: "This project uses Deck. Switch it on?", and what the page looks like until then.

**Resolved when** Liam has picked on the canvas. The answer names the takes and lists anything the designs need that the slot list does not give.

## Comments

### agent, 2026-11-10T18:15:36.312Z

## Resolution (task 572, 2026-11-10): Liam picked on the canvas

Three rounds on `explore/extensions` (12 takes, then the simple page, then four onboarding takes). Liam's steer: "i dont want to bloat the spool with this it should just be some way to add them no? and toggle them etc, cleanly". The winners are now in `design/frames/app/`, listed under To build, with their code in `design/shared/ui/spool/extensions/`.

### Picked

- **The extensions page** (`spool-settings--extensions`, `--extensions-confirm`, `--extensions-add`, `spool-canvas--extensions-reach`): a plain Extensions page in Settings, reached from the cog, a ⌘K row "Extensions" (kind Settings) and the app menu's "Extensions…". Nothing new on the canvas. One list grouped by what you make, an icon, name, one line and a switch per row. Flipping a switch says in one line what it added or took out, then settles. The basics fold into one line, "On for everyone". No search for now: the list is short and there is no marketplace yet (Liam agreed).
  - **Add extension…** takes a folder or a `.zip`, as does a drop anywhere on the page. It always copies into `~/.spool/extensions`. A folder without a manifest is refused in one line.
  - One not from spool asks once, in its row, that it can do anything spool can on this Mac.
  - **Show folder** opens `~/.spool/extensions`. One put there by hand, or added by an agent, waits off ("Added by claude") with Switch on / Remove.
  - Your own get **Export…** (a `.zip` to Downloads, to share) and Remove. **Linking** a folder you are developing is CLI only (`spool extension link`); a linked row reads "linked · ~/dev/tokens" and its Remove becomes Unlink, leaving the folder.
- **Onboarding** (`spool-setup--extensions`, from `setup-tiles`): the first-open window grows to 960x680. Two pages: what you make, then where your agent works. Answers are tiles holding their extensions with small live previews. Inner switches appear only when an answer holds two or more extensions (today Prototypes); a single-extension answer's tile is its only control, so an official extension added to an answer later gets switches by the count rule.
- **The notice** (`spool-canvas--extension-notice`, `--extension-notice-other`, from `setup-answer`): one line above the page, "This project uses Deck. Switch it on?". Switching on turns the plain page into a deck in place. For one not installed (Lottie) it says what it is and where it comes from and walks the person through adding it themselves.
- **Where things land** (`spool-canvas--extensions`, `--extensions-prototype`, `--extensions-loaded`, from `window-places`): every extension gets a fixed icon in its side's head, spool's own first, then a thin divider, then others'. Tools, Properties sections, menu items and ⌘K results follow the same order and icon. Switching one adds or removes it at the end; nothing else moves.

### What the designs need that the slot list does not give

- **A declared list of what an extension adds** (slot kind and name per piece), readable from the manifest before it is on: the page says what a switch adds, the notice and onboarding show it.
- **Display data in the manifest:** icon, one-line description, author, and which onboarding answer it belongs to (the count rule and the grouping by what you make depend on it). Per extension, an "on" and "off" sentence (what it adds, what goes, that the work stays).
- **Manifest file name:** the designs assume `extension.json` (pure data, as the spike decided).
- **Origin and state per installed extension:** official, copied, linked (with its path), added by an agent (which, in which project, when), and a **waiting** state (off until a person confirms) with its count on Settings' Extensions item.
- **Remove** (uninstall) is distinct from switching off; **Unlink** for linked ones; **Export** packs your own as a `.zip`.
- **Ways in:** a command row in ⌘K and an app-menu item, so ⌘K must list commands as well as frames, each with a kind.
- **A project-level notice slot** (a persistent keyed line above the page, with actions), not a toast; the one-time trust question can live in it.
- **Pane order and side:** `places` needs a stable order (spool's first, then by switch-on time) and authorship on every piece an extension draws (a divider between spool's and others').
- **Onboarding hands its picks to Settings:** a map from each answer to the extensions it switches on, and the window resize (animated on the Mac only; Windows and Linux jump to size).
