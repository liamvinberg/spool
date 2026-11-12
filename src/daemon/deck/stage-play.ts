import type { Context } from "hono";
import { z } from "zod";
import { TALK_NAME } from "../../deck/present-wire";
import { STAGE_GROUND } from "../../deck/stage-fit";
import type { StageConfig, StageSlideConfig } from "../../deck/stage-wire";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "../document";
import { type PlayerCompile, type PlayerConfig, playerChunkBase } from "../play";
import type { PlayerBundle, PlayerFrameRef } from "../player-compile";
import type { ResolveProject } from "../project-route";
import { listProjectFrames } from "../projection";
import { deckReadOf, readPage } from "./disk";

/**
 * A deck's talk played (spool#265), at the play address of a deck page: `/play/<project>?deck=<page>`, opening on
 * `frame` when it names a slide. On spool's own origin that address is the stage's first host, a black page holding
 * the stage and handing it the keys; on the render origin it is the stage's document, the talk's slides composed from
 * the project's player and nothing of the player's own drawing.
 */

export interface StagePlayDeps {
	on(): boolean;
	resolve: ResolveProject;
	/** the project's player, as ordinary play composes it */
	compile(root: string, frames: PlayerFrameRef[], start: string): Promise<PlayerCompile>;
	/** keep the project's player composed, as a play of it does */
	played(root: string): void;
	projectCapability(root: string): string;
	/** a single-use pass for one embedding of a stage document, and its check */
	issue(project: string, key: string): string;
	consume(token: string | undefined, project: string, key: string): boolean;
	renderOrigin(): string;
	controlToken: string;
	/** a document only spool's own window may hold */
	protect(c: Context): void;
}

/** What a stage address answers: where the stage's document is, once, the talk's size, and the talk it plays. */
export interface StageAddress {
	readonly address: string;
	readonly size: { readonly w: number; readonly h: number };
	readonly talk: StageConfig;
}

const passKey = (page: string) => `deck:${page}`;

/** The `room` of a play address: the talk whose room's window it is, presented from spool's own window. */
export const ROOM_QUERY = z.string().regex(TALK_NAME, { message: "not a talk" });

/** The talk of a deck page as its stage plays it, or why there is none to play. */
export function stageOf(root: string, page: string): StageConfig | { message: string } {
	const found = readPage(root, page);
	const deck = found === undefined ? undefined : deckReadOf(found);
	if (deck === undefined || "why" in deck) return { message: `no deck "${page}" to play` };
	const sizes = new Map(listProjectFrames(root).frames.map((frame) => [frame.name, { w: frame.w, h: frame.h }]));
	const slides: StageSlideConfig[] = [];
	for (const slide of deck.slides) {
		const size = sizes.get(slide.name);
		// a slide the talk names but nobody has made yet is a problem of the deck, and no part of the talk
		if (size === undefined) continue;
		slides.push({ frame: slide.name, beats: Math.max(1, slide.beats.length), live: slide.live, ...size });
	}
	if (slides.length === 0) return { message: `the talk of "${page}" has no slides yet` };
	return { page, size: deck.size, slides };
}

export function createStagePlay(deps: StagePlayDeps) {
	/** A fresh address of a deck's stage document, for a window of spool's to embed once. */
	function address(project: string, root: string, page: string): StageAddress | { message: string } {
		const stage = stageOf(root, page);
		if ("message" in stage) return stage;
		const token = deps.issue(project, passKey(page));
		const query = new URLSearchParams({ deck: page, shell: "1", handoff: token });
		return {
			address: `${deps.renderOrigin()}/play/${encodeURIComponent(project)}?${query}`,
			size: stage.size,
			talk: stage,
		};
	}

	/** The play address of a deck page, on either origin. */
	async function play(
		c: Context,
		query: {
			project: string;
			deck: string;
			frame?: string;
			shell?: "1";
			handoff?: string;
			room?: string;
			control: boolean;
		},
	): Promise<Response> {
		if (!deps.on()) return c.text("Not Found", 404);
		const project = deps.resolve(c, query.project);
		if ("response" in project) return project.response;
		const stage = stageOf(project.root, query.deck);
		if (query.control) {
			if ("message" in stage) return c.text(stage.message, 404);
			deps.protect(c);
			return c.html(
				stageHostDocument(
					{ project: query.project, page: query.deck, frame: query.frame, room: query.room },
					deps.controlToken,
				),
			);
		}
		const embedded = query.shell === "1";
		if (embedded && !deps.consume(query.handoff, query.project, passKey(query.deck))) {
			return c.html(refusedDocument("this stage's pass was used or has expired"), 403);
		}
		if (!embedded && query.handoff !== undefined) return c.text("a stage pass requires shell=1", 400);
		if ("message" in stage) return refuse(c, embedded, stage.message, 404);
		const start = stage.slides.find((slide) => slide.frame === query.frame)?.frame ?? stage.slides[0]?.frame ?? "";
		deps.played(project.root);
		const compiled = await deps.compile(project.root, listProjectFrames(project.root).frames, start);
		if (compiled.kind === "error") return refuse(c, embedded, compiled.message, 500);
		const talk = new Set(stage.slides.map((slide) => slide.frame));
		const config: PlayerConfig & { styles: Record<string, string>; deck: StageConfig } = {
			project: query.project,
			projectCapability: deps.projectCapability(project.root),
			start,
			scenario: "default",
			frames: Object.fromEntries(stage.slides.map((slide) => [slide.frame, { w: slide.w, h: slide.h }])),
			styles: Object.fromEntries([...compiled.bundle.styles].filter(([frame]) => talk.has(frame))),
			deck: stage,
		};
		c.header("cache-control", "no-store");
		return c.html(stageDocument(config, compiled.bundle));
	}

	function refuse(c: Context, embedded: boolean, message: string, status: 404 | 500): Response {
		return embedded ? c.html(refusedDocument(message), status) : c.text(message, status);
	}

	return { address, play };
}

/**
 * The stage's own look, before any slide's: the ground around the talk's screen, the slide on show above the ones rendered
 * out of sight, and the carry and dissolve between slides from the deck's design, which a slide's own styles may
 * override for what it names. The dissolve lays the new slide over the old one, which stays whole beneath it until the
 * new one is: the browser's own cross-fade fades both at once, and when the two fades fall out of step on a busy
 * machine, the room's screen dims between slides.
 */
export const STAGE_CSS = `html { background: ${STAGE_GROUND}; }
#root { position: absolute; inset: 0; }
.spool-stage-slide { position: absolute; left: 0; top: 0; overflow: hidden; transform-origin: 0 0; z-index: 0; }
.spool-stage-slide[data-spool-stage-shown] { z-index: 1; }
.spool-stage-kept { display: contents; }
.spool-stage-black { position: absolute; inset: 0; z-index: 2; background: #000; }
html[data-spool-stage-cursor="hidden"], html[data-spool-stage-cursor="hidden"] * { cursor: none !important; }
::view-transition-group(*) { animation-duration: 900ms; animation-timing-function: cubic-bezier(0.65, 0, 0.2, 1); }
::view-transition-old(root) { animation: none; }
::view-transition-new(root) { animation: 500ms cubic-bezier(0.22, 0.61, 0.36, 1) both spool-stage-in; mix-blend-mode: normal; }
@keyframes spool-stage-in { from { opacity: 0; } }
`;

/** The stage's document: the runtime, the talk's slides' modules asked for at once, and no drawing of spool's. */
function stageDocument(config: PlayerConfig & { deck: StageConfig }, bundle: PlayerBundle): string {
	const base = playerChunkBase(config.project);
	const modules = new Set([bundle.entry]);
	for (const slide of config.deck.slides) for (const name of bundle.screens.get(slide.frame) ?? []) modules.add(name);
	const preload = [...modules]
		.map((name) => `<link rel="modulepreload" href="${escapeHtml(base + name)}">`)
		.join("\n");
	const fonts = bundle.fonts === undefined ? "" : `<style>${escapeInlineStyle(bundle.fonts)}</style>\n`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.deck.page)} · ${escapeHtml(config.project)}</title>
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>${escapeInlineStyle(STAGE_CSS)}</style>
${fonts}<script type="importmap">${escapeJsonScript(bundle.importMap)}</script>
${preload}
</head>
<body>
<div id="root"></div>
<script type="module">import "spool";</script>
<script type="module">import ${escapeInlineScript(JSON.stringify(base + bundle.entry))};</script>
</body>
</html>
`;
}

/** A stage document that will not play: the ground, telling its host why, and showing nothing. */
function refusedDocument(message: string): string {
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>html { background: ${STAGE_GROUND}; }</style></head>
<body>
<script>window.parent.postMessage({ spool: "stage-refused", why: ${escapeInlineScript(JSON.stringify(message))} }, "*");</script>
</body>
</html>
`;
}

/**
 * The stage's first host: a page of the ground on spool's own origin holding the stage, its keys and its saved changes. With
 * `room` it is the room's window of a talk presented from spool's own window.
 */
function stageHostDocument(
	config: { project: string; page: string; frame: string | undefined; room: string | undefined },
	controlToken: string,
): string {
	const host = { ...config, controlToken };
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.page)} · ${escapeHtml(config.project)}</title>
<style>html, body, #root { width: 100%; height: 100%; margin: 0; background: ${STAGE_GROUND}; overflow: hidden; }</style>
</head>
<body>
<div id="root"></div>
<script>window.__SPOOL_STAGE_HOST__ = JSON.parse(${escapeJsonScript(JSON.stringify(host))});</script>
<script type="module">import { bootStageHost } from "/player-assets/deck-stage.js"; bootStageHost(window.__SPOOL_STAGE_HOST__);</script>
</body>
</html>
`;
}
