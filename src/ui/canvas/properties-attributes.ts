import { ASSET_MEDIA_TYPES } from "../../daemon/assets";
import { WALK_TARGET } from "../../daemon/hand-write";
import type { AttributeRead, PatchRefusal } from "../api";

/**
 * The rail's string fields (#260): which attributes an element offers, and
 * which of them a hand may write.
 *
 * The map is HTML's, per element, and extended as elements turn up rather than
 * derived from a full spec table — an `img` has `alt` and `src`, an `a` has
 * `href`, an `input` has `placeholder`. A table of every attribute HTML defines
 * would be a wall of empty fields on every div; a table of what these elements
 * are actually for is a surface somebody reads.
 *
 * Two things are drawn beyond the map. An attribute the element already
 * carries as a string is always a field, because a value in the file with
 * nowhere to change it is the absence this work exists to remove. And
 * `data-go` is drawn and never written: its value is a walk target, so the
 * arrow it draws lives on the flows surface and that is where it is edited.
 */

/** What a hand writes on any element, because HTML defines them on any element. */
const EVERY: readonly string[] = ["title", "aria-label"];

/**
 * What each element is for, in the order the rail draws it.
 *
 * Only intrinsic tags: a component's props are the owner chain's question and
 * a component instance leaves no stamp of its own, so `<CartRow>` gets the
 * attributes it is actually written with and no map of its own.
 */
const BY_TAG: Readonly<Record<string, readonly string[]>> = {
	a: ["href", "target", "rel"],
	area: ["href", "alt"],
	audio: ["src"],
	button: ["type", "name", "value"],
	form: ["action", "method"],
	iframe: ["src"],
	img: ["src", "alt"],
	input: ["type", "placeholder", "name", "value"],
	label: ["htmlFor"],
	option: ["value"],
	select: ["name"],
	source: ["src", "srcSet"],
	td: ["colSpan", "rowSpan"],
	textarea: ["placeholder", "name"],
	th: ["scope", "colSpan", "rowSpan"],
	time: ["dateTime"],
	track: ["src", "label"],
	video: ["src", "poster"],
};

/**
 * The elements a picture can be swapped on, which is `<img>` and nothing else.
 *
 * Said once because four surfaces ask it: the write lane gating the op, this
 * map deciding which field is a menu, the canvas deciding which selection arms
 * a drop, and the rail deciding whether to read the project's pictures at all.
 * A second tag would otherwise be four edits in four files.
 */
export function swappable(tag: string): boolean {
	return tag === "img";
}

/** What the OS file dialog offers, which is the one asset table read as media types. */
export const IMAGE_ACCEPT = [...new Set(Object.values(ASSET_MEDIA_TYPES))].sort().join(",");

/** The sentence a walk target carries, which is the lane's own refusal for it. */
export const WALK_REASON = "walk target, edit in flows";
export { WALK_TARGET };

/**
 * The refusals that reach a string field.
 *
 * A className that is an expression and an inline style both pin what a class
 * would say and neither one has any bearing on an `alt`, so the rail would be
 * greying live fields if it read the rung's refusal as one answer. These three
 * are the ones that are about the element rather than about its classes: it is
 * defined somewhere this frame does not own, the stamp hits nothing, or the
 * file will not parse.
 */
const BLOCKS: ReadonlySet<string> = new Set(["shared-definition", "stale-stamp", "unparsable"]);

export function blocksFields(refusal: PatchRefusal | undefined): string | undefined {
	return refusal !== undefined && BLOCKS.has(refusal.code) ? refusal.says : undefined;
}

/**
 * A handler, which is no string field however it is written.
 *
 * Everything else the element carries draws, expression and all — a value in
 * the file with nowhere to see it named is the absence this work removes. An
 * `onClick` is different in kind: it is never a string, so a row saying so on
 * every button would be a wall of refusals nobody learns anything from.
 */
const HANDLER = /^on[A-Z]/;

/** One row of the rail's source section. */
export interface AttributeField {
	name: string;
	/** the string the file holds, empty where the element carries none */
	value: string;
	/** what the file says instead, when the value is no literal a hand may write */
	expression?: string;
	/** why this field cannot be written, when it cannot */
	reason?: string;
	/** a `src` on an image is a picture rather than a string: it is chosen, never typed */
	asset?: true;
	/** the import the picture is written as: `./hero.png` */
	specifier?: string;
}

/**
 * The fields this element shows, in the order the rail draws them.
 *
 * The tag's own attributes first, so `alt` sits where it sits on every image;
 * then whatever else the file wrote on it, alphabetically, because there is no
 * order to inherit for those.
 */
export function fieldsFor(
	tag: string,
	attributes: readonly AttributeRead[],
	refusal?: PatchRefusal | undefined,
): AttributeField[] {
	const blocked = blocksFields(refusal);
	const held = new Map(attributes.map((attribute) => [attribute.name, attribute]));
	const mapped = BY_TAG[tag] ?? [];
	const known = [...mapped, ...EVERY];
	const extra = attributes
		.filter((attribute) => !known.includes(attribute.name) && !HANDLER.test(attribute.name))
		.map((attribute) => attribute.name)
		.sort((a, b) => a.localeCompare(b));
	return [...known, ...extra].map((name) => field(name, tag, held.get(name), blocked));
}

function field(
	name: string,
	tag: string,
	read: AttributeRead | undefined,
	blocked: string | undefined,
): AttributeField {
	const asset = name === "src" && swappable(tag) ? { asset: true as const } : {};
	if (name === WALK_TARGET) {
		return {
			name,
			value: read?.value ?? "",
			reason: WALK_REASON,
			...(read?.expression === undefined ? {} : { expression: read.expression }),
		};
	}
	if (read?.asset !== undefined) {
		// an identifier bound to an image import is the picture, not an expression
		// — and off an image there is nowhere to swap it, so it reads and never
		// writes: typing over it would put a URL where the asset rule wants an import
		const reason = blocked ?? (asset.asset === true ? undefined : `${name} is an import`);
		return {
			name,
			value: read.asset,
			specifier: read.asset,
			...(reason === undefined ? {} : { reason }),
			...asset,
		};
	}
	if (read?.expression !== undefined) {
		// the expression is the whole of the answer: what a hand would overwrite
		// is not a string, and naming it is what teaches the shape of the file
		return { name, value: "", expression: read.expression, reason: `${name} is an expression`, ...asset };
	}
	return { name, value: read?.value ?? "", ...(blocked === undefined ? {} : { reason: blocked }), ...asset };
}
