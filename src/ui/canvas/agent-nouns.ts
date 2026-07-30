/**
 * The canvas's own words for what a tool call is doing (#117, #135, #142, #193).
 *
 * The rail's rule is spool's nouns: `read cart`, never `read
 * design/frames/app/cart/frame.tsx`. The surface speaks frames and pages, and a
 * path lives behind the disclosure where it is reachable and never in the way.
 *
 * Nothing here is invented. Every verb is either spool's own — `read`, `write`,
 * `edit`, `look`, `delegate`, `find`, `ask` — or the agent's own word for what it
 * is doing, which the capture supplies. Where the agent went outside, the noun is
 * the one the binary sent with the call; spool never parses a wire name to guess a
 * service's name out of it.
 *
 * Two things about arguments shape the whole module. A tool call exists before its
 * arguments do — the block opens with a name and an empty input — so every reader
 * here answers null while the value it wants is still arriving, and the verb the
 * tool's own name gives is what the row opens with. And an argument arrives twice:
 * as uneven partial-JSON fragments that split mid-token, then as the parsed object
 * riding with the whole call. The fragments are a preview; the whole call is the
 * authority.
 */

/** a tool's arguments: partial JSON while they stream, the parsed object once whole */
export type CallInput = unknown;

/**
 * A call to a server that is not spool's, in the names the binary sent with it
 * (#142).
 *
 * The icon is not among them, deliberately: `icon_url` points at a third-party
 * favicon service, and a local-first canvas that fetched one per row would tell that
 * service which connectors the developer has. So this is the wire's `AgentForeign`
 * minus the one field a row must never carry, which is why it is its own type rather
 * than the event's passed along.
 */
export interface RowForeign {
	/** the server's own name, which is the one that reads like a service every time */
	readonly server: string | null;
	/** the tool's own name, as whoever wrote the server typed it */
	readonly tool: string | null;
	/** `mcp__<server>__<tool>`, which exists exactly once in this interface */
	readonly raw: string;
}

export interface CallName {
	readonly verb: string;
	/** null until the argument that names it has finished arriving */
	readonly subject: string | null;
	/**
	 * The frame the subject names, or null when the subject is a file that is not
	 * one (#143). Separate from the subject because they answer different questions:
	 * the subject is what to print and every row has one, this is whether the thing
	 * printed is a place a click could take you to.
	 */
	readonly frame: string | null;
	/** the one line behind the disclosure */
	readonly detail: string | null;
	/** the call changes a file, so consecutive ones to a frame are one row (#135) */
	readonly writes: boolean;
	/** the call is the binary fetching a deferred tool rather than work on the project (#142) */
	readonly finds: boolean;
}

/**
 * The calls that change a file, which are the ones a run is made of (#135).
 *
 * A run is not a run of `Edit`s. In the fan-out capture a delegate fixing one
 * frame goes `Edit, Edit, Write` and then `Edit, Write` — it switches to
 * rewriting the file whole partway through, and that is still one act.
 */
const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * The calls that get no row of their own, because what they produce outlives them.
 *
 * Seven `TaskCreate`s in nine seconds are one list, and that list then runs the next
 * nine minutes, so a log both buries it and loses it: the plan is one row for however
 * many calls write it, and the list itself leaves for a strip on the shelf (#117,
 * #194). A `TaskUpdate` is that list changing rather than a call worth a row, so it
 * draws nothing at all. A question is the same shape of thing from the other end —
 * the one entry in this log that has not happened yet — so it is the question that
 * gets drawn rather than the call that asked it, which is #197's.
 *
 * None of them reaches `nameCall`, and that is load-bearing twice over: a wire name
 * would otherwise reach a line whose whole rule is spool's nouns, and a call that
 * draws nothing cannot break a run.
 */
const UNDRAWN = new Set(["TaskCreate", "TaskUpdate", "AskUserQuestion"]);

/**
 * The read verbs whose one argument is a frame, from `spool skill`: `spool shot
 * <frame>`, `spool logs <frame>`, `spool url <frame>`. `selection`, `flows` and
 * `status` take none and `init`/`open` take a path, so a subject that came from
 * those is not a frame however much it looks like a name.
 */
const TAKES_FRAME = new Set(["shot", "logs", "url"]);

const PICTURE = /\.(?:png|jpe?g|webp|gif|svg)$/i;

/**
 * Whether this call gets a row of its own.
 *
 * Not whether it reaches the log at all: the plan's own creates share one row between
 * however many of them there are, and that row is built from the list rather than from
 * any one call, so it is drawn by the projection and never named here.
 */
export function drawsOwnRow(tool: string): boolean {
	return !UNDRAWN.has(tool);
}

/**
 * One task of the plan, as the call that wrote it phrased it twice (#117, #194).
 *
 * `TaskCreate` ships the written form and the present participle together, precisely
 * so that a surface never has to invent a friendlier wording for a task in progress.
 * Null is a create whose subject has not finished arriving, which is nothing to add to
 * a list yet.
 */
export function taskWritten(input: CallInput): { readonly subject: string; readonly running: string | null } | null {
	const subject = readField(input, "subject", true);
	return subject === null ? null : { subject, running: readField(input, "activeForm", true) };
}

/**
 * A task moving inside the plan, as the call that moved it names it (#194).
 *
 * `taskId` is the task's position in the list the creates wrote, counted from one, and
 * it is the wire's own shape rather than spool's choice. The status is the wire's own
 * word too: anything but these two leaves the task where it is.
 */
export function taskMoved(input: CallInput): { readonly at: number; readonly state: "running" | "done" } | null {
	const at = Number.parseInt(readField(input, "taskId", true) ?? "", 10);
	const status = readField(input, "status", true);
	if (!Number.isFinite(at)) return null;
	if (status === "in_progress") return { at, state: "running" };
	if (status === "completed") return { at, state: "done" };
	return null;
}

/**
 * One field out of a tool's arguments, and only once it is whole.
 *
 * The fragments are not JSON and never will be — they split mid-token, and the two
 * older fixtures hold a whole input serialised and then truncated at 160
 * characters — so this reads the string by hand rather than parsing and losing the
 * call. While the call is still streaming a value is answered only when its closing
 * quote has arrived, because a half-arrived path is not a shorter path but a
 * different one: `design/frames/ho` names no frame, and an empty subject slot for
 * that beat is the truth. Once the call is whole, whatever is there is all there
 * will ever be, so a value the fixture cut short is answered as it stands.
 */
function readField(input: CallInput, key: string, whole: boolean): string | null {
	if (input === undefined || input === null) return null;
	if (typeof input !== "string") {
		const value = (input as Record<string, unknown>)[key];
		return typeof value === "string" ? value : null;
	}
	const quoted = `"${key}"`;
	const found = input.indexOf(quoted);
	if (found < 0) return null;
	let index = input.indexOf('"', found + quoted.length + 1);
	if (index < 0) return null;
	let value = "";
	let closed = false;
	for (index += 1; index < input.length; index += 1) {
		const char = input[index];
		if (char === "\\") {
			index += 1;
			const next = input[index];
			value += next === "n" ? "\n" : next === "t" ? "\t" : (next ?? "");
			continue;
		}
		if (char === '"') {
			closed = true;
			break;
		}
		value += char;
	}
	if (!closed && !whole) return null;
	return value;
}

/**
 * One prose field as far as it has arrived (#145).
 *
 * The opposite reading to the one above, and the difference is the value rather than
 * the moment: a half-arrived path is not a shorter path but a different one, while a
 * half-arrived sentence is the same sentence with less of it. So a question types
 * itself in the way the wire sends it, in the same three beats every call gets.
 */
export function readProse(input: CallInput, key: string): string | null {
	return readField(input, key, true);
}

/**
 * The frame a path names, or null when the path is a file that is not one (#143).
 *
 * A frame is the folder that holds its entry — `frames/<name>/frame.tsx` at the
 * root page, `frames/<page>/<name>/frame.tsx` where a page holds it — so the frame
 * is the last folder rather than the file, which is also why the geometry sidecar
 * beside it needs no rule of its own: both files are the frame, and twelve rows
 * that each read `write frame.tsx` would name nothing at all.
 *
 * A verify shot is the same frame from the other end. 18 of 18 images in both
 * parent captures came back from `.spool/verify/<frame>.png`, so the rail never
 * has to say `.png` either.
 */
export function frameOf(path: string): string | null {
	const trimmed = path.replace(/\/+$/, "");
	const held = /(?:^|\/)frames\/(?:[^/]+\/)?([^/]+)\/[^/]*$/.exec(trimmed);
	const shot = /(?:^|\/)\.spool\/verify\/(.+)\.png$/.exec(trimmed);
	return held?.[1] ?? shot?.[1] ?? null;
}

/**
 * What a path is called on this rail.
 *
 * A frame is its own name. A folder directly under `frames/` with nothing after it
 * is the canvas's own name for a place — either a page or a frame sitting at the
 * root page — and either way it is a noun off the canvas rather than a path, which
 * is what this rail owes the reader; which of the two it is takes the project's own
 * frame list, and #143 hands that in rather than inferring it. Everything else is a
 * file and keeps its leaf: `read tokens.css`, `read AGENTS.md`.
 */
export function nameOf(path: string): string {
	const trimmed = path.replace(/\/+$/, "");
	const place = /(?:^|\/)frames\/([^/]+)$/.exec(trimmed);
	return frameOf(trimmed) ?? place?.[1] ?? trimmed.split("/").pop() ?? "";
}

/** the project-relative form, which is the useful one behind a disclosure */
export function relativeTo(path: string, root: string): string {
	const prefix = root === "" ? "" : root.endsWith("/") ? root : `${root}/`;
	return prefix !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * What one call is called, or null while spool still has no word for it.
 *
 * Null is the answer for exactly two cases and both are honest. A `Bash` call's
 * verb lives in the command it is about to run, and a call to a server that is not
 * spool's is named by metadata that rides with the whole call — so for that beat
 * the row waits rather than printing a wire name into a rail whose whole rule is
 * spool's nouns. #142 settled that `mcp__claude_ai_Notion__notion-search` exists
 * exactly once in this interface, one click down.
 *
 * A verb can sharpen when the argument lands: `run` becomes `shot home`, and a
 * `Read` of a picture becomes `look`. That is one beat learning what it is about
 * rather than a word being rewritten, because the thing that settles the verb is
 * inside the argument and arrives with it.
 */
export function nameCall(call: {
	readonly tool: string;
	readonly input: CallInput;
	readonly root: string;
	/** whatever the binary sent about a server that is not spool's, if anything */
	readonly foreign?: RowForeign | undefined;
	/** the whole call has landed, so an argument that is not here is not coming */
	readonly whole: boolean;
}): CallName | null {
	const { tool, input, root, foreign, whole } = call;
	const plain = { frame: null, detail: null, writes: false, finds: false } as const;

	if (foreign !== undefined) {
		/*
		 * `ask <Server>`, one line (#142). `ask` is spool's own verb, so no connector
		 * author can break the one mark that says the agent left the building — and the
		 * subject is the server, because measured across three servers the server name
		 * reads like a product every time while the tool's own name arrives Title-Cased,
		 * Hyphen-Cased or snake_case. The icon is dropped rather than carried: `icon_url`
		 * points at a third-party favicon service, and a local-first canvas must not tell
		 * anyone which connectors the developer has.
		 *
		 * Nothing is invented when a field is missing. A runtime that names the tool but
		 * not the server leaves the tool in the subject, which is ACP degrading exactly as
		 * #115 designed for. A runtime that names neither leaves the subject empty: the
		 * row still says the agent went outside, and the wire name stays where #142 put
		 * it, which is once, one click down, and never on a line.
		 */
		return { ...plain, verb: "ask", subject: foreign.server ?? foreign.tool ?? null, detail: tool };
	}

	if (tool === "Read" || WRITES.has(tool)) {
		const path = readField(input, "file_path", whole);
		const verb =
			tool === "Write"
				? "write"
				: tool === "Read"
					? path !== null && PICTURE.test(path)
						? "look"
						: "read"
					: "edit";
		if (path === null) return { ...plain, verb, subject: null, writes: WRITES.has(tool) };
		return {
			verb,
			subject: nameOf(path),
			frame: frameOf(path),
			detail: relativeTo(path, root),
			writes: WRITES.has(tool),
			finds: false,
		};
	}

	if (tool === "Bash") {
		const command = readField(input, "command", whole);
		if (command === null) return null;
		/*
		 * A compound command is several calls and it ends on its point, so the last spool
		 * verb in it is the one worth a row: `spool status; …; spool shot cart` went to
		 * look at cart. Anything that is not spool's falls back to the agent's own
		 * description of what it is doing, because the capture supplies that and inventing
		 * a friendlier sentence would be putting words in its mouth.
		 */
		const last = command
			.split(/\s*(?:&&|\|\||[;|])\s*/)
			.filter((part) => /^spool\s/.test(part))
			.at(-1);
		const spool = last === undefined ? null : /^spool\s+(\w+)\s*(.*)$/.exec(last);
		if (spool === null) {
			const description = readField(input, "description", whole);
			return { ...plain, verb: "run", subject: description, detail: command };
		}
		const verb = spool[1] ?? "run";
		// a redirection is shell rather than subject: `spool shot home 2>&1` looked at home
		const subject = (spool[2] ?? "").split(/\s*\d*>/)[0]?.trim() ?? "";
		const frame = TAKES_FRAME.has(verb) && /^[\w-]+$/.test(subject) ? subject : null;
		// `spool skill` and `spool selection` take no argument at all, so the verb is the
		// whole row rather than a verb with an empty slot after it
		return { ...plain, verb, subject: subject === "" ? null : subject, frame, detail: command };
	}

	if (tool === "Agent") return { ...plain, verb: "delegate", subject: readField(input, "description", whole) };

	// the agent fetching a deferred tool before it can call one. Its own words are the
	// query, the way a shell row's are its description — spool knows no better noun for
	// a search whose subject is a tool that is not spool's
	if (tool === "ToolSearch") return { ...plain, verb: "find", subject: readField(input, "query", whole), finds: true };

	// a tool spool has no noun for keeps the agent's own name for it, once the call is
	// whole enough to know no metadata is coming to name it better
	return whole ? { ...plain, verb: tool.toLowerCase(), subject: null } : null;
}
