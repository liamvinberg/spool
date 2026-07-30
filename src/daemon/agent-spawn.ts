import type { Attachment } from "../attachment";
import { skillText } from "../skill";

/**
 * What spool spawns, and what it tells the thing it spawned (#115, #121, #126,
 * #138).
 *
 * The spawn is the developer's own installed binary, resolved by bare name off
 * `PATH`, running against whatever login is already on the machine. Spool
 * configures no key, asks for none, and stores none — `apiKeySource: "none"` in
 * every capture is that claim's evidence.
 *
 * Spool overrides exactly two things about the developer's environment: where
 * settings come from, and the permission mode. Everything else rides along with
 * eyes open — skills, hooks, custom agents, connectors — because a designer
 * pulling tokens from a connector into spool is the difference between a canvas
 * and a toy, and inheriting means spool never owns an abstraction over
 * connectors.
 */

/** Bare name, off `PATH`: the agent the developer installed, not one spool ships. */
const AGENT_COMMAND = "claude";

/**
 * The one allow rule, and the whole of the fence (#121).
 *
 * Nothing is denied, because deny beats allow and cannot express an exception:
 * `deny(./**)` with `allow(./design/**)` blocks `design/` too. So the fence is a
 * list of what is quiet rather than a wall with a door, and everything outside
 * `design/` asks once rather than being blocked.
 *
 * `Edit` and not `Write`: the binary says out loud that `Write(path)` rules are
 * not matched by file permission checks and that `Edit` rules cover every
 * file-editing tool.
 */
export const AGENT_ALLOW_RULE = "Edit(./design/**)";

/**
 * The permission mode, set explicitly rather than left to the machine.
 *
 * Not cosmetic. Measured on 2.1.220, a default spawn loads the user's settings,
 * and a `defaultMode: bypassPermissions` there is inherited — a spool-spawned
 * agent ran with every check off, everywhere on disk, and the allow rule bought
 * nothing because nothing was ever going to ask.
 */
const AGENT_PERMISSION_MODE = "default";

/**
 * Where an approval goes, and the flag the whole of #121 rests on.
 *
 * Approvals arrive as data only when the permission prompt tool is wired to the
 * stdio the adapter already opens. Without it the ask has nowhere to land: the tool
 * fails quietly and the agent apologises and stops, so the fence would be a wall.
 * The binary's own help does not document this value.
 *
 * It buys the agent's own question too, and there is no choosing one without the
 * other: `AskUserQuestion` exists under `--print` only when a permission prompt tool
 * is wired, and its own check answers `ask` unconditionally, so no allow rule can
 * pre-answer it either.
 */
const AGENT_PERMISSION_PROMPT_TOOL = "stdio";

/**
 * Only the developer's own settings load. The project's stay out: a spool
 * project is a thing you open from someone else, its `allow` list can make its
 * own dangerous calls quiet, and opening someone's design must not change what
 * your agent may do.
 *
 * The cost is measured and paid in the framing below: `--setting-sources user`
 * takes the project's `CLAUDE.md` and `AGENTS.md` with the project's settings,
 * and there is no memory-only source.
 */
const AGENT_SETTING_SOURCES = "user";

/**
 * The five lines spool writes for itself (#138).
 *
 * They say what the agent is for and forbid nothing: #121 left writes outside
 * `design/` possible on purpose, so a prompt that closes them contradicts the
 * fence rather than completing it. The one line about the boundary buys
 * something a permission rule cannot — the agent saying what it is about to do
 * outside `design/` before the approval lands, rather than the human meeting a
 * modal cold.
 *
 * The line about the project's own memory file is the price of
 * `--setting-sources user`. Spool reading the file itself would mean
 * reimplementing memory discovery — `@` imports, nesting, precedence, the lazy
 * load — and a read that can be skipped is a smaller cost than a settings source
 * that grants.
 */
const FRAMING = `You are the agent inside Spool, a live prototyping canvas. The human is looking at
frames on that canvas and talking to you from a rail beside them.

The canvas is design/. Its contract is below; \`spool skill <topic>\` gets you depth
on any part of it.

What the human has selected arrives in their message inside a <selection> block.
That is what "this" and "that" mean.

Read the project's own CLAUDE.md or AGENTS.md before your first change. Spool does
not load it for you.

Writing under design/ is silent. Anything else asks the human first, so say what you
are about to do outside design/ before you do it.`;

/**
 * The framing plus the skill overview, which is a call into the same function
 * `spool skill` answers with rather than a second copy to keep in sync.
 *
 * Only the overview goes in, not the seven topics: 860 tokens against 6,170, and
 * a thread that renames one frame would pay for topics it never opens. The
 * overview's last section is the topic index, so the agent fetches exactly the
 * one it wants. Identical bytes on every spawn, so it caches.
 */
export function agentFraming(): string {
	return `${FRAMING}\n\n---\n\n${skillText()}`;
}

/** Everything the child process is: what to run, where, and with what. */
export interface AgentSpawn {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
}

/**
 * Which conversation this turn belongs to (#120, #200).
 *
 * The session id is the thread. Spool mints a uuid before there is any process, hands
 * it over as the session id on the thread's first turn, and resumes it on every turn
 * after — so a thread has an id before its first event lands and keeps the same one for
 * as long as it lives. Measured in #120: a resumed session keeps its id, does not fork,
 * and the agent remembers what it was told without anything being re-sent.
 *
 * `resume` is not a preference. `--session-id` wants an id the binary has never seen and
 * `--resume` wants one it has, so the two are exclusive and the caller answers it with a
 * file-existence check rather than a guess: a thread whose session has aged out starts a
 * fresh one under the same id instead of failing a resume.
 */
export interface AgentSession {
	readonly id: string;
	readonly resume: boolean;
}

/**
 * The settled spawn for one project root.
 *
 * `--include-partial-messages` is not a flag, it is the product: without it
 * there are no deltas at all, only whole assistant messages, and every state can
 * do nothing but pop into existence. `--input-format stream-json` opens
 * structured input on the way in, which is where images and queued messages go.
 *
 * The environment is the daemon's own, copied and otherwise untouched. Spool
 * adds nothing to it — no key is configured anywhere in this path — and removes
 * nothing either: someone's own CLI configured with a key breaks no promise
 * spool made, and stripping it would break their setup to make a slogan tidier.
 */
export function planAgentSpawn(
	root: string,
	env: Readonly<Record<string, string | undefined>>,
	session: AgentSession,
): AgentSpawn {
	return {
		command: AGENT_COMMAND,
		args: [
			"--print",
			"--output-format",
			"stream-json",
			"--include-partial-messages",
			"--verbose",
			"--input-format",
			"stream-json",
			// the thread, in the binary's own vocabulary for one. A resume restores the
			// agent's memory for free and emits no history, which is why the rail's picture
			// is spool's problem: the two halves of a thread are the id and the drawing
			session.resume ? "--resume" : "--session-id",
			session.id,
			"--setting-sources",
			AGENT_SETTING_SOURCES,
			"--permission-mode",
			AGENT_PERMISSION_MODE,
			"--permission-prompt-tool",
			AGENT_PERMISSION_PROMPT_TOOL,
			"--settings",
			JSON.stringify({ permissions: { allow: [AGENT_ALLOW_RULE] } }),
			"--append-system-prompt",
			agentFraming(),
		],
		cwd: root,
		env: { ...env },
	};
}

/**
 * One turn's worth of input, as the line the binary reads off stdin.
 *
 * Content is a block list rather than a bare string because that is where an
 * attached image goes (#119): the bytes ride as a base64 content block over the
 * stdin the adapter already opens, so nothing is written to the project.
 */
export function agentPromptLine(content: readonly unknown[]): string {
	return `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`;
}

/**
 * One thing the human said, with what was riding with it when they said it
 * (#116, #119, #170).
 *
 * `selection` is already rendered, because there is one renderer for it and the
 * daemon owns it: these are the bytes `spool selection` prints. It arrives here
 * rather than being looked up here because a queued message carries the block
 * from its own Enter rather than from the moment the queue fires.
 */
export interface AgentSaid {
	readonly prompt: string;
	/** the selection block that rode with these words; empty where nothing was pointed at */
	readonly selection: string;
	readonly attachment?: Attachment;
}

/**
 * The content blocks one turn sends: what the hands are pointing at, what they
 * typed, and whatever they attached (#116, #119, #170).
 *
 * The selection leads the text because it is the context the words are about, and
 * the attachment leads both because a reference is what the sentence refers to. An
 * empty selection contributes nothing at all rather than an empty block, which
 * would be a shape claiming the moment had one.
 *
 * A turn is a list rather than one message because a queue fires as one turn: every
 * message spool held goes out in the order it was said in, each carrying its own
 * selection block, and the binary reads all of them as the one thing it was asked.
 * They ride in one user message rather than one line each, so nothing depends on the
 * binary's own queueing to keep them from becoming two turns.
 */
export function agentPromptContent(said: readonly AgentSaid[]): unknown[] {
	const blocks: unknown[] = [];
	for (const one of said) {
		if (one.attachment !== undefined) {
			blocks.push({
				type: "image",
				source: { type: "base64", media_type: one.attachment.media, data: one.attachment.data },
			});
		}
		blocks.push({ type: "text", text: one.selection === "" ? one.prompt : `${one.selection}\n\n${one.prompt}` });
	}
	return blocks;
}
