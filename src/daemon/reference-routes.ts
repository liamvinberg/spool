import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isFramePath } from "../page-path";
import {
	type ReferenceCapture,
	type ReferenceOpened,
	type ReferenceSent,
	referenceCaptureSchema,
	referenceOpenSchema,
} from "../reference-wire";
import { realDesignDir } from "./design-path";
import type { Rect } from "./placement";
import { listProjectFramesAwaited } from "./projection";
import {
	placeReference,
	REFERENCES_PAGE,
	referenceFiles,
	referenceSlug,
	takenReferenceNames,
	writeReferenceFolder,
} from "./reference-frame";
import { type ReferenceFetch, type ReferenceLimits, referencePage } from "./reference-page";

/**
 * The door spool's Chrome extension knocks on (spool#241), and nothing else may. The extension's service worker
 * makes these requests, so the browser itself says `Origin: chrome-extension://<id>`, which no website can say, and
 * the id is the extension's own, pinned by the public key in its manifest. So these routes ask for that origin
 * instead of the control token, with no pairing to set up; the daemon's Host check already keeps a rebound DNS name
 * off them. A process on this Mac could forge the header, and could as well write the project's files directly.
 */

/** The extensions that may send references: spool's own, as its manifest key pins it. */
export const REFERENCE_EXTENSION_IDS: ReadonlySet<string> = new Set(["ajdldgfdhejgjjmmjcalpgffidppnoae"]);

export const REFERENCE_PATHS: ReadonlySet<string> = new Set(["/api/references", "/api/references/open"]);

/** The origin a request may be answered under, when it comes from an allowed extension; nothing otherwise. */
export function referenceOrigin(origin: string | undefined, ids = REFERENCE_EXTENSION_IDS): string | undefined {
	const id = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin ?? "")?.[1];
	return id !== undefined && ids.has(id) ? origin : undefined;
}

/** The most a capture may weigh: a long page with its sheets and a canvas or two as images is several MB. */
export const REFERENCE_BODY_BYTES = 64 * 1024 * 1024;

/** A project a reference may land in: where it is, and when it was last opened. */
export interface ReferenceCandidate {
	root: string;
	openedAt: string;
}

/**
 * The canvas a reference lands on: the one the person has open now, else the one they used last. An open canvas is
 * one with its event stream up; among several, and among none, the latest of its last open and its last word wins.
 */
export function chooseReferenceProject(
	projects: readonly ReferenceCandidate[],
	live: ReadonlyMap<string, number>,
): string | undefined {
	const at = (project: ReferenceCandidate) => Math.max(Date.parse(project.openedAt) || 0, live.get(project.root) ?? 0);
	const open = projects.filter((project) => live.has(project.root));
	const pool = open.length > 0 ? open : projects;
	return [...pool].sort((a, b) => at(b) - at(a))[0]?.root;
}

export interface ReferenceRouteDeps {
	/** the project to land in, by its root, and the name its canvas goes by */
	choose(): { root: string; name: string } | undefined;
	/** the part of one page of a project its canvas last showed, in world units */
	view(root: string, page: string): Rect | undefined;
	fetch: ReferenceFetch;
	limits?: Partial<ReferenceLimits>;
	/** tell an open canvas a reference arrived on it */
	arrived(root: string, frame: string): void;
	/** bring a canvas forward on a frame; whether a spool window took it */
	reveal(root: string, frame: string): boolean;
	/** a project by the name its canvas goes by */
	project(name: string): string | undefined;
	/** the canvas's address on a frame */
	canvasUrl(name: string, frame: string): string;
	now?: () => Date;
}

/** `POST /references` and `POST /references/open`, mounted under /api behind the extension's gate. */
export function referenceRoutes(deps: ReferenceRouteDeps) {
	const now = deps.now ?? (() => new Date());
	return new Hono()
		.post(
			"/references",
			bodyLimit({
				maxSize: REFERENCE_BODY_BYTES,
				onError: (c) => c.json({ error: "too-large", message: "This page is too big to send." }, 413),
			}),
			async (c) => {
				let body: unknown;
				try {
					body = await c.req.json();
				} catch {
					return c.json({ error: "invalid", message: "That capture isn't JSON." }, 400);
				}
				const parsed = referenceCaptureSchema.safeParse(body);
				if (!parsed.success)
					return c.json({ error: "invalid", message: "That capture isn't one spool reads." }, 400);
				const chosen = deps.choose();
				if (chosen === undefined) {
					return c.json({ error: "no-project", message: "Open a project in spool, then try again." }, 409);
				}
				const sent = await takeReference(chosen, parsed.data, deps, now());
				deps.arrived(chosen.root, sent.frame);
				return c.json(sent satisfies ReferenceSent);
			},
		)
		.post("/references/open", async (c) => {
			let body: unknown;
			try {
				body = await c.req.json();
			} catch {
				return c.json({ error: "invalid", message: "Say which frame to open." }, 400);
			}
			const parsed = referenceOpenSchema.safeParse(body);
			if (!parsed.success || !isFramePath(parsed.data.frame)) {
				return c.json({ error: "invalid", message: "Say which frame to open." }, 400);
			}
			const { project, frame } = parsed.data;
			const root = deps.project(project);
			if (root === undefined) return c.json({ error: "no-project", message: "That project isn't in spool." }, 404);
			const shown = deps.reveal(root, frame);
			return c.json({ shown, url: deps.canvasUrl(project, frame) } satisfies ReferenceOpened);
		});
}

/** The capture made a frame in references/ of the chosen project, placed where its canvas looks. */
async function takeReference(
	chosen: { root: string; name: string },
	capture: ReferenceCapture,
	deps: ReferenceRouteDeps,
	when: Date,
): Promise<ReferenceSent> {
	const page = await referencePage(capture, {
		fetch: deps.fetch,
		...(deps.limits === undefined ? {} : { limits: deps.limits }),
	});
	const designDir = realDesignDir(chosen.root);
	const projection = await listProjectFramesAwaited(chosen.root);
	const field = [
		...projection.frames.filter((frame) => frame.page === REFERENCES_PAGE),
		...projection.placeholders.filter((one) => one.page === REFERENCES_PAGE),
	];
	const geometry = placeReference(field, deps.view(chosen.root, REFERENCES_PAGE), capture.size);
	const slug = referenceSlug(capture, takenReferenceNames(designDir));
	writeReferenceFolder(designDir, slug, referenceFiles(capture, page, geometry, when));
	return { project: chosen.name, name: chosen.name, frame: `${REFERENCES_PAGE}/${slug}` };
}
