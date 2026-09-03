/**
 * Five conversations in one project, for `explore/threads`.
 *
 * The question is how a person reaches a thread that is not the one in front of them,
 * and what it is called when they get there. Today's name is the frames the thread wrote
 * (`nameOf` in `src/ui/canvas/agent-threads.ts`), which is short and unique and says
 * nothing about why. The alternative on the table is the first thing the person said.
 *
 * So each thread here carries both, and the asks are deliberately uneven: a five-word one,
 * a twenty-word one, one that runs to two lines at the rail's width. A take that truncates
 * has to be seen truncating the long ones, and a take that wraps has to be seen paying for
 * it in height.
 *
 * Lives are the shipped five. `streaming` is the thread in the panel, `running` works
 * somewhere else, `waiting` is stopped on a question, `unread` finished while nobody
 * looked, `read` is old.
 */

export type Life = "streaming" | "running" | "waiting" | "unread" | "read";

export interface Thread {
	readonly id: string;
	/** the first thing the person said */
	readonly ask: string;
	/** what the thread wrote, the shipped name; empty where it has written nothing */
	readonly wrote: string;
	readonly life: Life;
	/** age of the last thing that happened in it */
	readonly since: string;
	/** the last row it drew, in the rail's own nouns */
	readonly last: string;
}

/** the thread in the panel when a frame mounts */
export const LIVE: Thread = {
	id: "receipt",
	ask: "tidy the receipt and shoot it",
	wrote: "home, receipt",
	life: "streaming",
	since: "now",
	last: "edit home ×6",
};

export const THREADS: readonly Thread[] = [
	LIVE,
	{
		id: "takes",
		ask: "three takes on the empty cart, restrained to expressive, and keep the header exactly as it is on menu",
		wrote: "cart--empty, cart--empty-b",
		life: "running",
		since: "4m",
		last: "write cart--empty-c",
	},
	{
		id: "rounding",
		ask: "the menu prices don't line up with the cart totals, find where the rounding happens and make them agree everywhere",
		wrote: "",
		life: "waiting",
		since: "18m",
		last: "ask which total is right",
	},
	{
		id: "home",
		ask: "shoot home and fix what reads wrong",
		wrote: "home",
		life: "unread",
		since: "41m",
		last: "look home",
	},
	{
		id: "deck",
		ask: "write the swedish copy deck",
		wrote: "copy",
		life: "read",
		since: "2h",
		last: "run check line count",
	},
];

/** the shipped fallback where a thread has said nothing at all */
export const UNSAID = "new thread";

/** the name the rail prints today: frames written, then the ask, then `new thread` */
export function nameOf(thread: Thread): string {
	if (thread.wrote !== "") return thread.wrote;
	return thread.ask === "" ? UNSAID : thread.ask;
}
