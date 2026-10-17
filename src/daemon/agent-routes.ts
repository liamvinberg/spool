import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import { z } from "zod";
import { type Attachment, MAX_ATTACHMENT_BYTES, parseAttachments } from "../attachment";
import { isFramePath } from "../page-path";
import { lookupProjectByName } from "../registry";
import type { AgentAppLauncher } from "./agent-app";
import { parseAgentReply } from "./agent-control";
import { AGENT_PERMISSIONS, type AgentPermissions, type createAgentDefaults } from "./agent-defaults";
import { type AgentEngine, type AgentEngineId, isAgentEngineId, LEGACY_ENGINE } from "./agent-engine";
import {
	type createPlaceholderLedger,
	FrameStandsError,
	frameStands,
	putFrameBack,
	witnessFrames,
} from "./agent-frames";
import type { AgentHeld, createAgentTurns } from "./agent-live";
import { acceptedModelChoice, type createAgentModelPreferences } from "./agent-model-preferences";
import { type AgentAsk, isEffortShaped, isModelShaped } from "./agent-offer";
import { agentPictureEnding } from "./agent-picture";
import type { createAgentPresence } from "./agent-presence";
import { closeThread, isThreadId, parseThreadPut, putThread, readThread, serveThreads } from "./agent-threads";
import type { createChangeHub } from "./events";
import { type ResolveProject, withProject } from "./project-route";
import { type createSelectionStore, parseSelectionEntries, type SelectionEntry } from "./selection";
import { selectionBlock } from "./selection-block";
import type { AppEvent } from "./session";
import type { createProjectShares } from "./shares";
import type { PlaceholderAuthor } from "./sidecar";
import { beatWhileOpen } from "./sse-beat";
import { type createTeamSync, followedLink } from "./team-sync";

/**
 * A model or effort pick as the agent menu sends it, for the machine's choice and a
 * thread's alike (#118, #199). A leading dash is refused here rather than reasoned about
 * downstream: an offered model never starts with one, and a value that does is a value
 * handed to argv where a flag would go. An effort is one lowercase word, the shape a level
 * has to have to be an argument at all; which levels exist is the model's own claim, and
 * the offer's round trip is what refuses one the engine will not take.
 */
function modelChoice(value: unknown, c: Context): Response | AgentAsk {
	const body = (typeof value === "object" && value !== null ? value : {}) as { value?: unknown; effort?: unknown };
	if (body.value !== undefined && !isModelShaped(body.value))
		return c.text('"value" is one of the choices the engine offered', 400);
	if (body.effort !== undefined && !isEffortShaped(body.effort))
		return c.text('"effort" is one of the levels the model said it supports', 400);
	if (body.value === undefined && body.effort === undefined)
		return c.text('a choice is { "value": "…" } or { "effort": "…" }', 400);
	return {
		...(body.value === undefined ? {} : { value: body.value as string }),
		...(body.effort === undefined ? {} : { effort: body.effort }),
	};
}

/**
 * One view of a held turn, which is what both doors return (#211).
 *
 * The turn is not this response's to end. A client that goes away closes its own read and
 * leaves the process where it was — which is the whole of what #211 changed, and it is one
 * line: `onAbort` closes the view rather than abandoning the turn.
 *
 * It opens by saying what is being read: the name the rail's stop has to quote, whether
 * the process is still up, and how many events are already in the log. That last one is
 * what lets the rail draw the replay whole and pace only what arrives after it — the same
 * rule a picture off disk is under, since neither of them is happening now.
 */
function attachTurn(c: Context, held: AgentHeld, from: number) {
	return streamSSE(c, async (stream) => {
		const view = held.watch(from);
		stream.onAbort(() => view.close());
		const stopBeat = beatWhileOpen(stream);
		try {
			await stream.writeSSE({
				event: "attached",
				data: JSON.stringify({
					...(held.id === undefined ? {} : { turn: held.id }),
					running: held.running,
					from,
					logged: held.logged,
					elapsed: held.elapsed,
				}),
			});
			for await (const { id, event } of view) {
				try {
					await stream.writeSSE({ event: "agent", data: JSON.stringify(event), id: String(id) });
				} catch {
					// the client hung up mid-write — stop reading, and leave the turn running
					break;
				}
			}
		} finally {
			stopBeat();
			view.close();
		}
	});
}

/**
 * The agent rail's side of the daemon (#191's ADR): the machine's agent choice, a project's threads, and the
 * turns this daemon holds, mounted under `/api/p`. Project code never reaches this: it is a control-plane route
 * behind the control token, the same boundary #41 drew.
 */
export function agentRoutes(deps: {
	resolve: ResolveProject;
	spoolDir: string;
	engines: ReadonlyMap<AgentEngineId, AgentEngine>;
	agentDefaults: ReturnType<typeof createAgentDefaults>;
	modelPreferences: ReturnType<typeof createAgentModelPreferences>;
	liveTurns: ReturnType<typeof createAgentTurns>;
	/** Projects mid-rename: a model read that spans one answers that the project changed. */
	projectRenames: ReadonlySet<string>;
	selections: Pick<ReturnType<typeof createSelectionStore>, "get">;
	hub: ReturnType<typeof createChangeHub>;
	placeholders: ReturnType<typeof createPlaceholderLedger>;
	teamSync: Pick<ReturnType<typeof createTeamSync>, "copy">;
	projectShares: Pick<ReturnType<typeof createProjectShares>, "turnEnded">;
	agentPresence: Pick<ReturnType<typeof createAgentPresence>, "follow">;
	agentAppLauncher: AgentAppLauncher;
	emitAppEvent: (event: AppEvent) => void;
	/** This Mac's spool.page account, for the placeholders a team project's designers make. */
	account: () => Promise<{ accountId: string; email: string }>;
}) {
	const {
		spoolDir,
		engines,
		agentDefaults,
		modelPreferences,
		liveTurns,
		projectRenames,
		selections,
		hub,
		placeholders,
		teamSync,
		projectShares,
		agentPresence,
		agentAppLauncher,
		emitAppEvent,
	} = deps;
	/**
	 * Who this Mac is signed in to spool.page as, which the placeholders its designers make on a team project
	 * name (#378). Asked again as each turn there starts and the last answer kept, so making one never waits.
	 */
	let signedInAs: PlaceholderAuthor | undefined;
	const askWhoIsSignedIn = (): void =>
		void deps.account().then(
			(one) => {
				signedInAs = { accountId: one.accountId, name: one.email.split("@")[0] || one.email };
			},
			() => {},
		);

	/** the engine this daemon runs under an id, or none for an id it doesn't know or doesn't run */
	function engineById(id: unknown): AgentEngine | undefined {
		return isAgentEngineId(id) ? engines.get(id) : undefined;
	}

	function engineFor(c: Context, root: string, thread?: string, requested: unknown = c.req.query("engine")) {
		if (thread !== undefined && !isThreadId(thread))
			return { response: c.text("a thread is named by its uuid", 400) };
		if (requested !== undefined && !isAgentEngineId(requested)) return { response: c.text("unknown engine", 400) };
		const saved = thread === undefined ? undefined : readThread(spoolDir, root, thread);
		// the bundled engine's threads are read-only: their picture stays, and nothing continues them
		if (saved?.engine === LEGACY_ENGINE) return { response: c.text("this thread's engine was removed", 409) };
		if (saved !== undefined && requested !== undefined && requested !== saved.engine) {
			return { response: c.text("a thread's engine cannot change", 409) };
		}
		// a thread with no model session yet takes the machine's choice, never a guess of its own
		const id = saved?.engine ?? requested ?? agentDefaults.read().engine;
		const engine = id === undefined ? undefined : engines.get(id);
		if (engine === undefined) return { response: c.text(`engine "${id ?? "none"}" is unavailable`, 503) };
		return { engine, session: saved?.session ?? { id: thread ?? "" } };
	}

	/** a running turn started on another mode than the machine's: the pick waits for its next turn */
	function pendingMode(root: string, thread: string, mode: AgentPermissions): boolean {
		const held = liveTurns.get(root, thread);
		return held?.running === true && held.mode !== mode;
	}

	return (
		new Hono()
			/*
			 * The two ways there is no agent to talk to, one door each (#201).
			 *
			 * They are two doors because they are two questions, and `agent-preflight.ts` is
			 * where that split is argued. What the shape of these routes carries is when each is
			 * allowed to be asked: the `which` is free and stable, so the rail asks it on open,
			 * and the login costs a process inside somebody else's product, so it is only ever
			 * opened by a hand on `check again`.
			 */

			/*
			 * The machine's agent choice (#361): the same in every project, saved before it is
			 * answered, so what comes back is what the next thread will really use.
			 */
			.get("/:project/agent/engines", (c) =>
				withProject(c, deps.resolve, () => {
					const choice = agentDefaults.read();
					return c.json({
						preferred: choice.engine ?? null,
						mode: choice.mode,
						engines: [...engines.values()].map((engine) => ({
							id: engine.id,
							installed: engine.installed(),
							...(engine.outdated?.() === true ? { outdated: true } : {}),
						})),
					});
				}),
			)
			.put(
				"/:project/agent/engines",
				validator("json", (value, c) => {
					const engine = (typeof value === "object" && value !== null ? value : {}) as { preferred?: unknown };
					if (!isAgentEngineId(engine.preferred) || !engines.has(engine.preferred))
						return c.text('a choice is { "preferred": "<engine>" }, one this daemon runs', 400);
					return { preferred: engine.preferred };
				}),
				(c) =>
					withProject(c, deps.resolve, () => {
						const choice = agentDefaults.setEngine(c.req.valid("json").preferred);
						emitAppEvent({ kind: "settings" });
						return c.json({ preferred: choice.engine ?? null, mode: choice.mode });
					}),
			)
			.get("/:project/agent-app", (c) =>
				withProject(c, deps.resolve, () => {
					return c.json({ available: agentAppLauncher.available() });
				}),
			)
			.post("/:project/agent-app", async (c) =>
				withProject(c, deps.resolve, async (root) => {
					try {
						await agentAppLauncher.open(root);
						return c.body(null, 204);
					} catch (error) {
						return c.text(error instanceof Error ? error.message : "Could not open ChatGPT.", 409);
					}
				}),
			)
			.get(
				"/:project/agent/installed",
				validator("query", (value) =>
					z.object({ engine: z.string().optional(), thread: z.string().optional() }).parse(value),
				),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const selected = engineFor(c, root, c.req.query("thread"));
						if ("response" in selected) return selected.response;
						const { engine } = selected;
						return c.json({
							installed: engine.installed(),
							...(engine.outdated?.() === true ? { outdated: true } : {}),
						});
					}),
			)
			.get(
				"/:project/agent/login",
				validator("query", (value) =>
					z.object({ engine: z.string().optional(), thread: z.string().optional() }).parse(value),
				),
				async (c) =>
					withProject(c, deps.resolve, async (root) => {
						// the probe is this request's process and nobody else's, so it goes when the
						// request does: a page navigated off mid-check would otherwise leave a whole
						// binary running for the length of its own timeout with nobody to hear it
						const selected = engineFor(c, root, c.req.query("thread"));
						if ("response" in selected) return selected.response;
						return c.json(await selected.engine.account(root, c.req.raw.signal));
					}),
			)
			.post(
				"/:project/agent/turn",
				validator("json", (value, c) => {
					const body = (typeof value === "object" && value !== null ? value : {}) as {
						said?: unknown;
						recovery?: unknown;
						turn?: unknown;
						thread?: unknown;
						engine?: unknown;
						session?: unknown;
					};
					// a turn is what the human said, which is one message when they pressed Enter
					// against a quiet rail and several when a queue fired as one turn (#170)
					if (!Array.isArray(body.said) || body.said.length === 0) {
						return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
					}
					if (body.turn !== undefined && (typeof body.turn !== "string" || body.turn === "")) {
						return c.text('"turn" is the id a stop names this turn by', 400);
					}
					// the conversation this turn belongs to, which is the agent's own session id
					// (#120): spool mints it before there is a process, so it is never optional and
					// never anything but the uuid shape the binary takes
					if (!isThreadId(body.thread)) {
						return c.text('"thread" is the uuid this conversation runs under', 400);
					}
					if (body.session !== undefined || (body.engine !== undefined && !isAgentEngineId(body.engine))) {
						return c.text("choose an engine; session references belong to the daemon", 400);
					}
					const said: { prompt: string; selection?: SelectionEntry[]; attachments?: readonly Attachment[] }[] = [];
					for (const raw of body.said) {
						const one = (typeof raw === "object" && raw !== null ? raw : {}) as {
							prompt?: unknown;
							selection?: unknown;
							attachments?: unknown;
						};
						if (typeof one.prompt !== "string" || one.prompt.trim() === "") {
							return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
						}
						// an attachment is optional and never guessed at: a picture spool cannot
						// send is said out loud rather than dropped out of the message (#119)
						const attached = one.attachments === undefined ? undefined : parseAttachments(one.attachments);
						if (one.attachments !== undefined && attached === undefined) {
							return c.text(
								`an attachment is { "media": "image/png", "data": "<base64>" } — png, jpeg, gif or webp under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
								400,
							);
						}
						// a message that captured its own selection at Enter hands it back here;
						// one that did not is asking for what the hands are pointing at now (#170)
						const captured = one.selection === undefined ? undefined : parseSelectionEntries(one.selection);
						if (one.selection !== undefined && captured === undefined) {
							return c.text('"selection" is the entry list this daemon served the rail', 400);
						}
						said.push({
							prompt: one.prompt,
							...(captured === undefined ? {} : { selection: captured }),
							...(attached === undefined ? {} : { attachments: attached }),
						});
					}
					if (body.recovery !== undefined && typeof body.recovery !== "string")
						return c.text("Invalid recovery", 400);
					return {
						...(typeof body.recovery === "string" ? { recovery: body.recovery } : {}),
						said,
						thread: body.thread,
						...(body.engine === undefined ? {} : { engine: body.engine as AgentEngineId }),
						turn: typeof body.turn === "string" ? body.turn : undefined,
					};
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						// one turn, streamed as it arrives (#191): the prompt goes down the
						// binary's stdin and its events come back over this response in the
						// order the wire sent them
						const { said, thread, engine: requested, turn: named, recovery } = c.req.valid("json");
						/*
						 * One turn per conversation, refused rather than replaced (#211).
						 *
						 * A thread holding a running turn is a thread with a process standing in the repo,
						 * and a second one would be two agents writing the same files against a prompt
						 * neither of them can see. The rail queues into a running turn rather than sending,
						 * so this only ever catches a client that lost its stream and came back without
						 * attaching — and saying so is what sends it to the door below.
						 */
						if (liveTurns.get(root, thread)?.running === true) {
							return c.text(
								`a turn is already running in thread "${thread}" — attach to it rather than starting a second`,
								409,
							);
						}
						const selected = engineFor(c, root, thread, requested);
						if ("response" in selected) return selected.response;
						const ask = modelPreferences.read(root, thread, selected.engine.id);
						modelPreferences.keep(root, thread, selected.engine.id, ask);
						// Claim ownership before starting: a picture save may race the first turn.
						if (readThread(spoolDir, root, thread) === undefined) {
							putThread(spoolDir, root, thread, {
								engine: selected.engine.id,
								ask: said[0]?.prompt ?? "",
								life: "running",
								at: Date.now(),
								entries: said.map((one, index) => ({
									key: `user:${index}`,
									kind: "user",
									text: one.prompt,
									context: null,
									attached: one.attachments ?? [],
								})),
								kept: said.length,
								plan: null,
								queued: [],
								draft: "",
							});
						}
						const mode = agentDefaults.read().mode;
						const engineTurn = selected.engine.start({
							...(recovery === undefined ? {} : { recovery }),
							root: root,
							session: readThread(spoolDir, root, thread)?.session ?? selected.session,
							permissions: mode,
							said: said.map((one) => ({
								prompt: one.prompt,
								selection: selectionBlock(one.selection ?? selections.get(root)),
								...(one.attachments === undefined ? {} : { attachments: one.attachments }),
							})),
							ask,
						});
						// the frames the turn makes, however it writes them, are read off design/ (#365)
						const team = followedLink(root) !== undefined;
						if (team) askWhoIsSignedIn();
						const turn = witnessFrames(engineTurn, {
							root: root,
							hub,
							placeholders,
							...(team ? { author: () => signedInAs } : {}),
						});
						const picture = readThread(spoolDir, root, thread);
						const pictured = picture ? agentPictureEnding(spoolDir, root, picture) : undefined;
						const held = liveTurns.hold({
							onEnded: (events) => {
								pictured?.(events);
								// the turn's saves are done: the pages they touched settle for whoever they are shared with
								teamSync.copy(root)?.turnEnded();
								projectShares.turnEnded(root);
							},
							root: root,
							thread,
							turn,
							witness: turn,
							mode,
							...(named === undefined ? {} : { id: named }),
						});
						if (team) agentPresence.follow(held);
						return attachTurn(c, held, 0);
					}),
			)
			/*
			 * The same turn, read again from wherever a client left off (#211).
			 *
			 * A refresh, a lid, a dropped socket: the browser loses the response and the turn goes
			 * on, so what a returning rail needs is not a new turn but the one it was reading. It
			 * asks for the turn in this thread, says how much of it it has, and gets the rest —
			 * the log from that point, and then everything that arrives after.
			 *
			 * From zero by default, which is what a fresh page asks for: the fold from the event
			 * union to the drawing is the rail's and it is pure, so handing back every event the
			 * turn has produced rebuilds exactly what was on screen. Nothing down here folds
			 * anything, which is #120's seam kept where it was.
			 */
			.get(
				"/:project/agent/turn/:thread",
				validator("query", (value) => {
					// how much of the turn the client already has, which is the id it wants first.
					// Anything that is not a whole number is a client that has nothing, and that is a
					// replay rather than a refusal: a bad query must cost the read no events, never
					// the turn
					const said = (value as { from?: unknown }).from;
					const from = Number.parseInt(typeof said === "string" ? said : "", 10);
					return { from: Number.isInteger(from) && from > 0 ? from : 0 };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const thread = c.req.param("thread");
						if (!isThreadId(thread)) {
							return c.text("a thread is named by the uuid its session runs under", 400);
						}
						const held = liveTurns.get(root, thread);
						// nothing is being held for this conversation: it ended long enough ago to have
						// been let go of, or it never ran here. Both are the same fact from here, and the
						// picture on disk is the whole of what the rail can draw for one of them
						if (held === undefined) return c.text(`no turn to read in thread "${thread}"`, 404);
						return attachTurn(c, held, c.req.valid("query").from);
					}),
			)
			/*
			 * The permission mode, which is the machine's and never refused (#361).
			 *
			 * A pick is saved at once and is what every new turn spawns with. A turn already
			 * running keeps the mode it started on until its next turn boundary, so `pending`
			 * says the menu's pick is waiting on that turn rather than in force. It used to be
			 * applied to the running process first and saved only if that worked, and every
			 * refusal there (a spawn or host not ready yet, a second pick while the first was
			 * waiting, a turn ending) left the old mode saved and the menu reading it back.
			 */
			.get("/:project/agent/threads/:thread/permissions", (c) =>
				withProject(c, deps.resolve, (root) => {
					const thread = c.req.param("thread");
					if (!isThreadId(thread)) return c.text("a thread is named by its uuid", 400);
					const mode = agentDefaults.read().mode;
					return c.json({ mode, pending: pendingMode(root, thread, mode) });
				}),
			)
			.put(
				"/:project/agent/threads/:thread/permissions",
				validator("json", (value, c) => {
					const body = (typeof value === "object" && value !== null ? value : {}) as { mode?: unknown };
					const mode = AGENT_PERMISSIONS.find((one) => one === body.mode);
					return mode === undefined
						? c.text(`"mode" must be one of ${AGENT_PERMISSIONS.join(", ")}`, 400)
						: { mode };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const thread = c.req.param("thread");
						if (!isThreadId(thread)) return c.text("a thread is named by its uuid", 400);
						const { mode } = agentDefaults.setMode(c.req.valid("json").mode);
						emitAppEvent({ kind: "settings" });
						return c.json({ mode, pending: pendingMode(root, thread, mode) });
					}),
			)
			.post(
				"/:project/agent/interrupt",
				validator("json", (value, c) => {
					const body = (typeof value === "object" && value !== null ? value : {}) as { turn?: unknown };
					if (typeof body.turn !== "string" || body.turn === "") {
						return c.text('a stop is { "turn": "…" }', 400);
					}
					return { turn: body.turn };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						/*
						 * The way out of a turn that is already running (#165).
						 *
						 * Its own door for the reason an answer has one: the turn's stream is a
						 * response the client is reading and has no way back up. The turn names
						 * itself when it starts, so a project holding two of them stops the one the
						 * hands are looking at rather than both.
						 *
						 * What goes down the wire is a request rather than a kill. The process
						 * survives it and ends the turn itself, which is why this answers with
						 * nothing: everything there is to say arrives on the stream.
						 */
						const { turn: named } = c.req.valid("json");
						for (const held of liveTurns.of(root)) {
							if (held.id === named && held.interrupt()) return c.body(null, 204);
						}
						// nothing is running under that name: it ended on its own, or it was never
						// this project's. Both are the same fact from here, and both mean stopped
						return c.text(`no turn "${named}" to stop`, 404);
					}),
			)
			.post(
				"/:project/agent/put-back",
				validator("json", (value, c) => {
					const body = (typeof value === "object" && value !== null ? value : {}) as {
						thread?: unknown;
						frame?: unknown;
						source?: unknown;
						sidecar?: unknown;
					};
					if (typeof body.thread !== "string" || typeof body.frame !== "string" || body.frame === "")
						return c.text('a put back is { "thread": "…", "frame": "…" }', 400);
					return {
						thread: body.thread,
						frame: body.frame,
						source: typeof body.source === "string" ? body.source : undefined,
						sidecar: typeof body.sidecar === "string" ? body.sidecar : null,
					};
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						/*
						 * Put back a frame a turn deleted (#365).
						 *
						 * Only into the thread it was deleted in. A turn this daemon still holds kept the
						 * deleted source, and is the one word on what it deleted: a frame not in its log
						 * is refused, whatever the rail sends. A turn already let go of has only the log
						 * the rail kept, which carries the same source, so the rail's copy stands in for
						 * a thread that is on disk.
						 */
						const { thread, frame, source, sidecar } = c.req.valid("json");
						if (!isThreadId(thread)) return c.text("a thread is named by the uuid its session runs under", 400);
						if (!isFramePath(frame)) return c.text(`"${frame}" is not a frame name`, 400);
						const held = liveTurns.get(root, thread);
						if (held === undefined && readThread(spoolDir, root, thread) === undefined)
							return c.text(`no thread "${thread}" in this project`, 404);
						const witness = held?.witness;
						const kept =
							witness !== undefined
								? witness.kept(frame)
								: source === undefined
									? undefined
									: { source, sidecar };
						if (kept === undefined) {
							if (frameStands(root, frame)) return c.text(`a frame "${frame}" stands there`, 409);
							return c.text(`no deleted frame "${frame}" kept in thread "${thread}"`, 404);
						}
						try {
							putFrameBack(root, { frame, source: kept.source, sidecar: kept.sidecar });
						} catch (error) {
							if (error instanceof FrameStandsError) return c.text(error.message, 409);
							return c.text(error instanceof Error ? error.message : String(error), 400);
						}
						witness?.restored(frame, kept.source);
						hub.publish(root, { kind: "frame", frame });
						return c.body(null, 204);
					}),
			)
			.post(
				"/:project/agent/answer",
				validator("json", (value, c) => {
					const body = (typeof value === "object" && value !== null ? value : {}) as {
						request?: unknown;
						reply?: unknown;
					};
					const reply = parseAgentReply(body.reply);
					if (typeof body.request !== "string" || body.request === "" || reply === undefined) {
						return c.text(
							'an answer is { "request": "…", "reply": { "kind": "allow" | "always" | "deny" | "said" | "picked" } }',
							400,
						);
					}
					return { request: body.request, reply };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						/*
						 * The answer to a request the turn is parked on (#121, #145).
						 *
						 * It is its own door rather than a second body on the turn's stream, because
						 * that stream is a response the client is reading and has no way back up. The
						 * request's own id is the address, so nothing here has to name a turn: a
						 * project can hold several and exactly one of them is holding this request.
						 */
						const { request, reply } = c.req.valid("json");
						for (const held of liveTurns.of(root)) {
							if (held.answer(request, reply)) return c.body(null, 204);
						}
						// nobody is waiting on it: the turn ended, it was answered already, or it
						// belongs to another project. All three are the same fact from here
						return c.text(`no waiting request "${request}"`, 404);
					}),
			)
			/*
			 * The threads of this project, as they survive (#120, #136, #200).
			 *
			 * The picture is the rail's and the disk is the daemon's, which is the whole seam:
			 * the fold from the event union to what is drawn lives in the rail, so the rail is
			 * what writes the drawing, and nothing down here has a second opinion about the
			 * vocabulary. What the daemon adds is the two facts only it can answer — whether a
			 * thread's process was taken by a restart, and whether the agent's own session is
			 * still there to continue.
			 */
			.get("/:project/agent/threads", async (c) =>
				withProject(c, deps.resolve, async (root) => {
					const threads = await Promise.all(
						serveThreads(spoolDir, root, { live: liveTurns.threads(root) }).map(async (thread) => {
							const engine = engineById(thread.engine);
							let continuable = false;
							try {
								continuable = engine?.installed() === true && (await engine.continuable(root, thread.session));
							} catch {
								/* A missing session or host never hides saved history. */
							}
							const held = liveTurns.get(root, thread.id);
							const live =
								held !== undefined &&
								(held.running || thread.life === "running" || (thread.life === "waiting" && !thread.recovery));
							return { ...thread, live, continuable };
						}),
					);
					return c.json({ threads });
				}),
			)
			.put(
				"/:project/agent/threads/:thread",
				validator("json", (value, c) => {
					const put = parseThreadPut(value);
					if (put === undefined) {
						return c.text('a thread is { "ask": "…", "life": "read", "entries": [] }', 400);
					}
					return put;
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const thread = c.req.param("thread");
						if (!isThreadId(thread)) {
							return c.text("a thread is named by the uuid its session runs under", 400);
						}
						const put = putThread(spoolDir, root, thread, c.req.valid("json"));
						// the picture the rail carried on from is not the one stored: it writes the whole one
						if (put === "moved") return c.text("the stored picture is not the one this put carries on", 412);
						if (!put) return c.text("a thread's engine cannot change", 409);
						return c.body(null, 204);
					}),
			)
			/*
			 * Closing a thread, which is a tidy rather than a delete (#136).
			 *
			 * It leaves the strip and it leaves nothing else: not the agent's own session, and
			 * not spool's stored picture. Spool does not throw away a readable record because a
			 * tab was put away, so this writes one flag and touches no bytes of the drawing.
			 */
			.post("/:project/agent/threads/:thread/close", (c) =>
				withProject(c, deps.resolve, (root) => {
					const thread = c.req.param("thread");
					if (!closeThread(spoolDir, root, thread)) {
						return c.text(`no thread "${thread}" to close`, 404);
					}
					return c.body(null, 204);
				}),
			)
			/*
			 * What this thread may pick, and what is answering (#118, #199).
			 *
			 * Asked of the binary every time rather than cached, because the answer is the
			 * installed CLI's: a new model appears because the developer updated it, and a table
			 * spool shipped would be a release behind on the day that happened. It costs one
			 * spawn, no turn and no token — `list_models` is a control request and a bare
			 * `/model` is answered before the model ever sees it.
			 *
			 * Under the thread rather than beside it, because `current` is a fact about one
			 * conversation: the rows are the binary's and the same for all of them, and which of
			 * those rows is answering is not.
			 */
			/*
			 * What one engine offers a new chat, for the agent menu's other groups (#364). The
			 * thread routes below answer for the thread's own engine; these answer for any engine
			 * this daemon runs, against the machine's choice for it, so the menu can list every
			 * installed agent's models and a pick on one carries to the next chat that uses it.
			 */
			.get("/:project/agent/engines/:engine/models", async (c) =>
				withProject(c, deps.resolve, async (root) => {
					const id = c.req.param("engine");
					const engine = engineById(id);
					if (engine === undefined) return c.text(`engine "${id}" is unavailable`, 404);
					return c.json(
						await engine.offer({
							root: root,
							session: { id: "" },
							ask: agentDefaults.model(engine.id),
							signal: c.req.raw.signal,
						}),
					);
				}),
			)
			.post("/:project/agent/engines/:engine/model", validator("json", modelChoice), async (c) =>
				withProject(c, deps.resolve, async (root) => {
					const id = c.req.param("engine");
					const engine = engineById(id);
					if (engine === undefined) return c.text(`engine "${id}" is unavailable`, 404);
					const held = agentDefaults.model(engine.id);
					const offer = await engine.offer({
						root: root,
						session: { id: "" },
						ask: held,
						choose: c.req.valid("json"),
					});
					if (offer.current.value !== null)
						agentDefaults.setModel(engine.id, acceptedModelChoice(engine, offer, held));
					return c.json(offer);
				}),
			)
			.get(
				"/:project/agent/threads/:thread/models",
				validator("query", (value) => z.object({ engine: z.string().optional() }).parse(value)),
				async (c) =>
					withProject(c, deps.resolve, async (root) => {
						const thread = c.req.param("thread");
						if (!isThreadId(thread)) {
							return c.text("a thread is named by the uuid its session runs under", 400);
						}
						const selected = engineFor(c, root, thread);
						if ("response" in selected) return selected.response;
						const held = modelPreferences.read(root, thread, selected.engine.id);
						const offer = await selected.engine.offer({
							root: root,
							session: selected.session,
							ask: held,
							signal: c.req.raw.signal,
						});
						if (
							projectRenames.has(root) ||
							lookupProjectByName(spoolDir, c.req.param("project")).kind !== "found"
						)
							return c.text("Project changed while reading models.", 409);
						if (offer.current.value !== null) {
							modelPreferences.keep(
								root,
								thread,
								selected.engine.id,
								acceptedModelChoice(selected.engine, offer, held),
							);
						}
						return c.json(offer);
					}),
			)
			.post(
				"/:project/agent/threads/:thread/model",
				validator("query", (value) => z.object({ engine: z.string().optional() }).parse(value)),
				validator("json", modelChoice),
				async (c) =>
					withProject(c, deps.resolve, async (root) => {
						/*
						 * Choosing one, which is sending the message (#118, #199).
						 *
						 * The menu is a shortcut for `/model haiku` and never a second source of truth,
						 * so this sends that message and answers with what came back. What spool keeps
						 * is only the ask the binary confirmed: an alias it resolved to nothing, or an
						 * effort the environment holds, leaves the readout exactly where it was,
						 * because nothing moved.
						 */
						const thread = c.req.param("thread");
						if (!isThreadId(thread)) {
							return c.text("a thread is named by the uuid its session runs under", 400);
						}
						const wanted = c.req.valid("json");
						const selected = engineFor(c, root, thread);
						if ("response" in selected) return selected.response;
						const held = modelPreferences.read(root, thread, selected.engine.id);
						const offer = await selected.engine.offer({
							session: selected.session,
							root: root,
							ask: held,
							choose: wanted,
						});
						if (
							projectRenames.has(root) ||
							lookupProjectByName(spoolDir, c.req.param("project")).kind !== "found"
						)
							return c.text("Project changed while choosing a model.", 409);
						if (offer.current.value !== null) {
							modelPreferences.keep(
								root,
								thread,
								selected.engine.id,
								acceptedModelChoice(selected.engine, offer, held),
								true,
							);
						}
						return c.json(offer);
					}),
			)
	);
}
