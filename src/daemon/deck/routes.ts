import { Hono } from "hono";
import { type DeckRead, type DecksRead, parseDeckChange, type UnreadDeck } from "../../deck/wire";
import type { ChangeHub } from "../events";
import { refused, refusing } from "../export-routes";
import type { ExportAnswer, ExportedFile } from "../html-export";
import { answeringDiskRefusals, type ResolveProject, withProject } from "../project-route";
import { changeDeck } from "./change";
import { deckPages, deckReadOf, readPage } from "./disk";
import type { DeckKeeper } from "./keeper";
import { type StageAddress, stageOf } from "./stage-play";

/**
 * A project's decks over HTTP, mounted under `/api/p` (spool#265): one read of every deck, and the one change every
 * hand's gesture goes through. With the experiment off neither answers, as no route of spool does.
 */
export function deckRoutes(deps: {
	resolve: ResolveProject;
	on: () => boolean;
	keeper: Pick<DeckKeeper, "watch" | "settleAll" | "problems">;
	hub: Pick<ChangeHub, "publish">;
	/** a fresh address of a deck's stage document, for a window of spool's to embed */
	stage: (project: string, root: string, page: string) => StageAddress | { message: string };
	/** a deck's talk as one HTML file that plays from disk (spool#275) */
	talkFile: (root: string, project: string, page: string) => Promise<ExportAnswer<ExportedFile>>;
}) {
	return new Hono()
		.get("/:project/decks", (c) => {
			if (!deps.on()) return c.notFound();
			return withProject(c, deps.resolve, (root) => {
				const read = answeringDiskRefusals(c, () => {
					deps.keeper.watch(root);
					// what changed while nobody was keeping this project is laid out before it is read
					deps.keeper.settleAll(root);
					const decks: DeckRead[] = [];
					const unread: UnreadDeck[] = [];
					for (const page of deckPages(root)) {
						const found = readPage(root, page);
						const deck = found === undefined ? undefined : deckReadOf(found);
						if (deck === undefined) continue;
						const known = deps.keeper.problems(root, page);
						if ("why" in deck) unread.push({ ...deck, problems: [...deck.problems, ...known] });
						else decks.push({ ...deck, problems: [...deck.problems, ...known] });
					}
					const answer: DecksRead = { decks, unread };
					return answer;
				});
				return "response" in read ? read.response : c.json(read.value);
			});
		})
		.get("/:project/deck-stage", (c) => {
			// the talk a deck's stage plays, read again by a host to know whether a change to the deck changed it
			if (!deps.on()) return c.notFound();
			const page = c.req.query("page");
			if (page === undefined) return c.text("a stage's talk is asked for as ?page=", 400);
			return withProject(c, deps.resolve, (root) => {
				const talk = stageOf(root, page);
				return "message" in talk ? c.text(talk.message, 404) : c.json(talk);
			});
		})
		.get("/:project/deck-export", (c) => {
			// the talk as one file, downloaded: the HTML half of exporting a talk; its PDF is captured in the window
			if (!deps.on()) return c.notFound();
			const page = c.req.query("page");
			if (page === undefined) return c.text("a talk's file is asked for as ?page=", 400);
			const project = c.req.param("project");
			return withProject(c, deps.resolve, async (root) => {
				const answer = await refusing(() => deps.talkFile(root, project, page));
				if (answer.kind !== "ok") return refused(c, answer);
				const { html, filename } = answer.value;
				c.header("content-disposition", `attachment; filename="${filename.replace(/["\\]/g, "_")}"`);
				c.header("cache-control", "no-store");
				return c.html(html);
			});
		})
		.post("/:project/deck-stage", async (c) => {
			if (!deps.on()) return c.notFound();
			const body: unknown = await c.req.json().catch(() => undefined);
			const page = typeof body === "object" && body !== null ? (body as { page?: unknown }).page : undefined;
			if (typeof page !== "string") return c.text('a stage is asked for as { "page" }', 400);
			const project = c.req.param("project");
			return withProject(c, deps.resolve, (root) => {
				const stage = deps.stage(project, root, page);
				return "message" in stage ? c.text(stage.message, 404) : c.json(stage);
			});
		})
		.post("/:project/deck", async (c) => {
			if (!deps.on()) return c.notFound();
			const change = parseDeckChange(await c.req.json().catch(() => undefined));
			if (change === undefined) {
				return c.text(
					'a deck change is { "page", "kind": "insert" | "place" | "reorder" | "arrange" | "size" | "make" | "notes" | "restore", ... }',
					400,
				);
			}
			return withProject(c, deps.resolve, (root) => {
				let done: ReturnType<typeof answeringDiskRefusals<ReturnType<typeof changeDeck>>>;
				try {
					done = answeringDiskRefusals(c, () => changeDeck(root, change));
				} catch (error) {
					// a write the disk refused: the change was put back whole before this answer
					const why = error instanceof Error ? error.message : String(error);
					return c.text(`the deck change could not be written, and nothing of it stands: ${why}`, 500);
				}
				if ("response" in done) return done.response;
				const answer = done.value;
				if ("status" in answer) return c.text(answer.message, answer.status);
				// a window hears its own change at once, and every other window with it
				if (answer.changed) deps.hub.publish(root, { kind: "deck", page: change.page });
				return c.json(answer);
			});
		});
}
