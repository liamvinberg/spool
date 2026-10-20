import { extractJsxSpan } from "./daemon/jsx-span";
import { frameFolder } from "./page-path";
import { parseStampRef, type StampRef } from "./stamp";

/**
 * An element's four handles from what a frame's shim saw of it (#6, #23): the frame, the source path and lines, the
 * selector, the excerpt, and what spool calls it. Worked out from the stamp and the text of the file it names,
 * whoever holds the file: the daemon reads it from `design/`, Spool Cloud from the team's copy, for a comment a
 * browser places (spool#173). Nothing here reads a file.
 */

/** One element as the shim saw it. */
export interface PickedElement {
	frame: string;
	selector: string;
	outerHtml: string;
	/** Nearest data-spool-source stamp, "frames/…/frame.tsx:line:col". */
	source: string | null;
	/** The stamp sits on an ancestor: JS-created DOM. */
	generated: boolean;
}

/** The handles, as the selection and a comment both carry them. */
export interface ElementHandles {
	name: string;
	path: string;
	lines: [number, number];
	selector: string;
	excerpt: string;
	generated?: true;
}

const EXCERPT_CAP = 240;

/**
 * A stamp taken at its word, inside `design/` by spelling alone: no absolute path, no step up. Undefined for one
 * that isn't, which degrades the element as an unstamped one does.
 */
export function designStamp(source: string | null): StampRef | undefined {
	const at = parseStampRef(source);
	if (at === undefined || at.line < 1 || at.column < 1) return undefined;
	const rel = at.rel.replaceAll("\\", "/");
	const parts = rel.split("/").filter((part) => part !== "" && part !== ".");
	if (rel.startsWith("/") || /^[A-Za-z]:/u.test(rel) || parts.length === 0 || parts.includes("..")) return undefined;
	return { rel: parts.join("/"), line: at.line, column: at.column };
}

/**
 * The handles of a picked element, given its stamp (when it has one inside `design/`) and the text of the file the
 * stamp names (when that file could be read). Generated elements degrade honestly: lines point at the nearest
 * stamped ancestor, the excerpt is the live outerHTML, the selector is the primary handle.
 */
export function elementHandles(
	{ frame, selector, outerHtml, generated }: PickedElement,
	stamp: StampRef | undefined,
	text: string | undefined,
): ElementHandles {
	if (stamp === undefined) {
		// no stamp anywhere: JS-created DOM under an unstamped root (#6 degrade)
		return {
			name: tagOf(outerHtml),
			path: `design/${frameFolder(frame)}/frame.tsx`,
			lines: [1, 1],
			selector,
			excerpt: cap(outerHtml),
			generated: true,
		};
	}
	const span = text === undefined ? undefined : extractJsxSpan(text, stamp.line, stamp.column);
	const lines: [number, number] = span?.lines ?? [stamp.line, stamp.line];
	// a generated element's own markup never exists in source: live outerHTML
	// is the excerpt, the stamped ancestor lends its lines
	const excerpt = generated ? cap(outerHtml) : (span?.excerpt ?? lineOf(text, stamp.line) ?? cap(outerHtml));
	// and its name comes from the same place its excerpt does — the stamped
	// ancestor's authored name would be somebody else's word for it
	const name = generated ? tagOf(outerHtml) : (span?.name ?? tagOf(outerHtml));
	const handles: ElementHandles = { name, path: `design/${stamp.rel}`, lines, selector, excerpt };
	return generated ? { ...handles, generated: true } : handles;
}

/** The stamped line verbatim — the needle when the span cannot be walked. */
function lineOf(text: string | undefined, line: number): string | undefined {
	const said = text?.split("\n")[line - 1];
	return said === undefined || said.trim() === "" ? undefined : said.trim();
}

/** An excerpt held to the length every handle keeps. */
export function cap(text: string): string {
	return text.length <= EXCERPT_CAP ? text : `${text.slice(0, EXCERPT_CAP - 1)}…`;
}

/**
 * The live DOM's own word for an element, off the serialization it handed over.
 *
 * `outerHTML` always opens on the tag, so this is a read rather than a guess; the
 * fallback exists because a payload is somebody else's input and a noun is not
 * worth a 400.
 */
function tagOf(outerHtml: string): string {
	return /^<\s*([A-Za-z][\w$.:-]*)/.exec(outerHtml.slice(0, 80))?.[1] ?? "element";
}
