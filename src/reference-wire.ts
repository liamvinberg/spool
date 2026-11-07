import { z } from "zod";

/**
 * What spool's Chrome extension sends the local daemon, and what it gets back (spool#241).
 *
 * The extension picks an element or the whole page, serializes it in the tab and posts it from its service worker to
 * `POST /api/references` on this Mac's daemon. The daemon fetches what the tab could not read (cross-origin
 * stylesheets, images, fonts), stores them in the project and writes a reference frame into `references/` on the
 * canvas that is open. The extension imports these types only; the daemon validates with the schemas.
 */

export const REFERENCE_WIRE_VERSION = 1;

const attrs = z.record(z.string(), z.string());

export const referenceStyleSchema = z.discriminatedUnion("kind", [
	/** a sheet the tab could read through the CSSOM: its text, with url()s as authored, relative to `base` */
	z.object({ kind: z.literal("text"), text: z.string(), base: z.string(), media: z.string().optional() }),
	/** a sheet the tab could not read (cross-origin without CORS): the daemon fetches it */
	z.object({ kind: z.literal("link"), href: z.string(), media: z.string().optional() }),
]);

export const referenceCaptureSchema = z.object({
	v: z.literal(REFERENCE_WIRE_VERSION),
	/** the page's URL and title */
	url: z.string(),
	title: z.string(),
	/** the whole page, or one element */
	whole: z.boolean(),
	/** what the picker's tab said it was on: `section.pricing`, or the host for a whole page */
	label: z.string(),
	/** the captured box in CSS pixels: the element's, or the viewport's width by the page's scroll height */
	size: z.object({ w: z.number().positive(), h: z.number().positive() }),
	/** the tab's viewport, so media queries resolve as they did */
	viewport: z.object({ w: z.number().positive(), h: z.number().positive() }),
	/**
	 * The captured markup: the element (wrapped in shallow copies of its ancestors, so the site's selectors still
	 * match), or the body for a whole page. No scripts, no inline handlers; resource URLs absolute.
	 */
	html: z.string(),
	/** attributes of the page's <html> and <body> (class, data-theme, lang, dir, inline style…) */
	htmlAttrs: attrs,
	bodyAttrs: attrs,
	/** the background the element sat on, when its own is transparent, as a CSS colour */
	backdrop: z.string().optional(),
	/** every active stylesheet in document order, adopted sheets included */
	styles: z.array(referenceStyleSchema),
	/** CSS generated from the Web Animations running in the subtree (JS-started, e.g. Framer Motion) */
	animations: z.string(),
	/** what could not come, one short line each (cross-origin iframes, video streams, closed shadow roots…) */
	notes: z.array(z.string()),
});

export type ReferenceCapture = z.infer<typeof referenceCaptureSchema>;
export type ReferenceStyle = z.infer<typeof referenceStyleSchema>;

/** the daemon's answer to a capture it took */
export interface ReferenceSent {
	/** the project's folder name, as in `/p/:project` */
	project: string;
	/** what the receipt calls the project: `In references/ on <name>` */
	name: string;
	/** the frame's path in the project, e.g. `references/linear-app-hero` */
	frame: string;
}

/** `POST /api/references/open`: bring that canvas forward on the frame */
export const referenceOpenSchema = z.object({ project: z.string(), frame: z.string() });
export type ReferenceOpen = z.infer<typeof referenceOpenSchema>;

/** the answer to an open: `shown` when a spool window (the Mac app or an open canvas tab) took it */
export interface ReferenceOpened {
	shown: boolean;
	/** the canvas URL on the frame, for the extension to open in a tab when nothing was shown */
	url: string;
}
