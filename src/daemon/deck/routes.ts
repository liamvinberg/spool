import { Hono } from "hono";
import { type DeckRead, type DecksRead, parseDeckChange, type UnreadDeck } from "../../deck/wire";
import type { ChangeHub } from "../events";
import { answeringDiskRefusals, type ResolveProject, withProject } from "../project-route";
import { changeDeck } from "./change";
import { deckPages, deckReadOf, readPage } from "./disk";
import type { DeckKeeper } from "./keeper";

/**
 * A project's decks over HTTP, mounted under `/api/p` (spool#265): one read of every deck, and the one change every
 * hand's gesture goes through. With the experiment off neither answers, as no route of spool does.
 */
export function deckRoutes(deps: {
	resolve: ResolveProject;
	on: () => boolean;
	keeper: Pick<DeckKeeper, "watch" | "settleAll">;
	hub: Pick<ChangeHub, "publish">;
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
						if ("why" in deck) unread.push(deck);
						else decks.push(deck);
					}
					const answer: DecksRead = { decks, unread };
					return answer;
				});
				return "response" in read ? read.response : c.json(read.value);
			});
		})
		.post("/:project/deck", async (c) => {
			if (!deps.on()) return c.notFound();
			const change = parseDeckChange(await c.req.json().catch(() => undefined));
			if (change === undefined) {
				return c.text(
					'a deck change is { "page", "kind": "insert" | "trade" | "place" | "reorder" | "arrange" | "size" | "make" | "restore", ... }',
					400,
				);
			}
			return withProject(c, deps.resolve, (root) => {
				const done = answeringDiskRefusals(c, () => changeDeck(root, change));
				if ("response" in done) return done.response;
				const answer = done.value;
				if ("status" in answer) return c.text(answer.message, answer.status);
				// a window hears its own change at once, and every other window with it
				if (answer.changed) deps.hub.publish(root, { kind: "deck", page: change.page });
				return c.json(answer);
			});
		});
}
