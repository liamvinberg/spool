/**
 * The two messages these frames are drawn against.
 *
 * Both are lines in an array rather than a template literal, because both are full of
 * backticks and an escaped fence is unreadable in source.
 */

/**
 * The message that broke, verbatim.
 *
 * Every hard part of the problem is in it and none of it was arranged: the first header
 * cell is empty, so the column holding the row labels has no name; the cells hold prose
 * rather than numbers, so nothing is right-alignable and nothing is short; one cell holds
 * bold, so a cell is not a string; and the row labels are the longest strings in the table,
 * so the column that cannot be dropped is the widest one.
 */
export const TABLE_SAID: string = [
	"Two closes had it. Measured over the tail:",
	"",
	"| | before | after |",
	"|---|---|---|",
	"| nick (shooting bare sheet) | 60px bruise gone in 1 frame | draws in over 13 frames (217ms) |",
	"| heal (coming back through the door) | 60px bruise **+ 10px of bent paper** gone in 1 frame | both ride down over 6 frames |",
].join("\n");

/**
 * Everything else the renderer cannot draw, in one message.
 *
 * Written in spool's own voice about spool's own subject so the smaller decisions are read
 * against real prose: a heading, italic, a link, an image, strikethrough, a rule, a
 * two-level nested list, a list item that wraps, a three-line blockquote, a fence with a
 * language on it, a task list, and bold with emphasis inside it.
 */
export const GAPS_SAID: string = [
	"## What the walk found",
	"",
	"I read every frame on the `agent` page and walked the three that declare a flow. Two of them",
	"land somewhere real. The third points at a frame that is *gone*.",
	"",
	"- `agent-play--say-read` walks to `agent-play--shot-open`",
	"  - the arrow is verified, and the walk replays in 1.2s",
	"  - nothing about it moved when #163 landed",
	"- `agent-walk-ambient` walks to `agent-mark--open`, which no longer exists, so the map docks it",
	"  on the frame that declares it rather than drawing an arrow to nowhere",
	"- ~~`agent-nav-strip`~~ declares no walk at all",
	"",
	"> The map draws everything it knows, always.",
	"> An off-page walk docks on the frame that declares it.",
	"> A broken one docks in the same place and says so.",
	"",
	"The rule lives in `flow-map.ts`, and it is *one* function:",
	"",
	"```ts",
	"export function dockedWalks(frames: readonly Frame[]): readonly Dock[] {",
	"\treturn frames.flatMap((frame) =>",
	"\t\tframe.walks.filter((walk) => walk.target === undefined).map((walk) => ({ frame, walk })),",
	"\t);",
	"}",
	"```",
	"",
	"---",
	"",
	"![the map with one docked walk](design/shared/assets/walk-dock.png)",
	"",
	"Left to do, and none of it is blocked:",
	"",
	"- [x] read every frame that declares a walk",
	"- [ ] fix the one broken target",
	"- [ ] re-run `spool flows` and diff it",
	"",
	"The rest is on [#146](https://github.com/liamvinberg/spool/issues/146), including the",
	"**map's own *before* and after**.",
].join("\n");

/**
 * The rail's real widths (`agent-rail.tsx:68`).
 *
 * `RAIL_WIDTH` is **420** and that is the case that decides this; 200 is `MIN_WIDTH` and
 * has to not break; 480 is `MAX_WIDTH` and is the most room a table can ever be given.
 * 300 is in the range because `inspector.tsx` shipped it as the default before #144 moved
 * it, and `design/AGENTS.md` still says 300 in places.
 */
export const RAIL_WIDTHS: readonly number[] = [200, 300, 420, 480];

/** the rail's default, and the width every argument here is written against */
export const RAIL_DEFAULT = 420;

/** the ceiling the drag stops at */
export const RAIL_MAX = 480;

/** the transcript's own `px-3.5` either side: a rail of 420 is 392 of text */
export const RAIL_PAD = 28;

/** how much of an arriving message the rail treats as live, in drawn characters */
export const LIVE_TAIL = 150;
