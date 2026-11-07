import { createHash } from "node:crypto";
import {
	type FigDocument,
	type FigNode,
	type FigPaint,
	nodeId,
	parseFig,
	parseFigBinary,
	resolveVectorNodePaths,
} from "openfig-core";
import { SpoolError } from "../../errors";
import type { ImportAdapter, ImportedFrame, ImportRead } from "./imports";
import { slugOf, unique } from "./slug";

/**
 * Figma's adapter: a `.fig` (Save local copy, on every plan) read on this Mac with no account and no token. A copy
 * from Figma's clipboard is the same binary, so a paste will read through here too.
 */
export const figma: ImportAdapter = {
	source: "Figma",
	takes: (fileName) => /\.fig$/iu.test(fileName),
	read: (bytes, fallbackName) => readFigma(figDocumentOf(bytes), fallbackName),
};

const MAX_FIG_BYTES = 512 * 1024 * 1024;

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;
const isKiwi = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 8)).toString("latin1") === "fig-kiwi";

/** The document in a `.fig` (a zip holding canvas.fig) or a bare canvas.fig, refused when it is neither. */
export function figDocumentOf(bytes: Uint8Array): FigDocument {
	if (bytes.length > MAX_FIG_BYTES) throw new SpoolError("This Figma file is too big to read.");
	try {
		if (isZip(bytes)) return parseFig(bytes);
		if (isKiwi(bytes)) return parseFigBinary(bytes);
	} catch {
		throw new SpoolError("This Figma file could not be read. Save it again from Figma with Save local copy.");
	}
	throw new SpoolError("This is not a Figma file. In Figma, use File → Save local copy.");
}

const idOf = (guid: { sessionID: number; localID: number } | undefined) =>
	guid === undefined ? "" : `${guid.sessionID}:${guid.localID}`;

const round = (n: number) => Math.round(n * 100) / 100;
const px = (n: number) => `${round(n)}`;

function hex({ r, g, b }: { r: number; g: number; b: number }): string {
	return `#${[r, g, b]
		.map((c) =>
			Math.round(Math.max(0, Math.min(1, c)) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function colour(color: { r: number; g: number; b: number; a?: number } | undefined, opacity = 1): string {
	if (color === undefined) return "none";
	const alpha = round((color.a ?? 1) * opacity);
	return alpha >= 1 ? hex(color) : `${hex(color)}/${alpha}`;
}

const ICONISH = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "REGULAR_POLYGON", "ELLIPSE", "LINE"]);
const SHAPES = new Set([...ICONISH, "RECTANGLE", "ROUNDED_RECTANGLE"]);
const CONTAINERS = new Set(["FRAME", "GROUP", "SYMBOL", "INSTANCE", "SECTION"]);
const SKIPPED = new Set(["WIDGET", "STICKY", "CONNECTOR", "SHAPE_WITH_TEXT", "STAMP", "CODE_BLOCK", "MEDIA"]);
const ICON_MAX = 128;

type Overrides = ReadonlyMap<string, Record<string, unknown>>;

/**
 * Reads one document into pages of outlines. A layer is one line, indented under its parent: its kind and name,
 * its size and where it sits (left out where auto layout places it), then only what it sets. An instance is drawn
 * out of its component with the instance's overrides, so a frame reads whole without its components page.
 */
export function readFigma(doc: FigDocument, fallbackName: string): ImportRead {
	const children = (node: FigNode): FigNode[] =>
		(doc.childrenMap.get(nodeId(node) ?? "") ?? []).filter((child) => child.phase !== "REMOVED");
	const pages = doc.nodes.filter((node) => node.type === "CANVAS" && node.internalOnly !== true);
	const files = new Map<string, Uint8Array>();
	const hashes = new Map<string, string>();

	// every top-level frame by id, wherever a prototype link points into it
	const topOf = new Map<string, string>();
	const tops = pages.map((page) => ({ page, frames: topFrames(page) }));
	function topFrames(page: FigNode): FigNode[] {
		const found: FigNode[] = [];
		for (const child of children(page)) {
			if (child.visible === false || SKIPPED.has(child.type)) continue;
			if (child.type === "SECTION") found.push(...topFrames(child));
			else if (CONTAINERS.has(child.type) && child.resizeToFit !== true) found.push(child);
		}
		return found;
	}
	const names = new Map<string, string>();
	for (const { frames } of tops)
		for (const frame of frames) {
			const id = nodeId(frame) ?? "";
			names.set(id, frame.name);
			const mark = (node: FigNode) => {
				topOf.set(nodeId(node) ?? "", id);
				for (const child of children(node)) mark(child);
			};
			mark(frame);
		}

	const image = (paint: FigPaint): string | undefined => {
		const raw = (paint as unknown as { image?: { hash?: Record<string, number> } }).image?.hash;
		if (raw === undefined) return undefined;
		const key = Buffer.from(Object.values(raw)).toString("hex");
		const known = hashes.get(key);
		if (known !== undefined) return known;
		const bytes = doc.images.get(key);
		if (bytes === undefined) return undefined;
		const path = `images/${key.slice(0, 12)}.${imageExtension(bytes)}`;
		files.set(path, bytes);
		hashes.set(key, path);
		return path;
	};

	const paints = (list: readonly FigPaint[] | undefined): string[] =>
		(list ?? [])
			.filter((paint) => paint.visible !== false)
			.map((paint) => {
				if (paint.type === "SOLID") return colour(paint.color, paint.opacity ?? 1);
				if (paint.type === "IMAGE") {
					const path = image(paint);
					const mode = (paint as { imageScaleMode?: string }).imageScaleMode;
					return `image ${path ?? "(missing)"}${mode === undefined || mode === "FILL" ? "" : ` ${mode.toLowerCase()}`}`;
				}
				if (paint.type.startsWith("GRADIENT_")) {
					const stops = ((paint as { stops?: { color: FigPaint["color"]; position: number }[] }).stops ?? [])
						.map((stop) => `${colour(stop.color, paint.opacity ?? 1)} ${round(stop.position * 100)}%`)
						.join(", ");
					return `${paint.type.slice(9).toLowerCase()}-gradient(${stops})`;
				}
				return paint.type.toLowerCase();
			});

	const linksOf = (node: FigNode, from: string): { line: string; to: string[] } => {
		const interactions = (node.prototypeInteractions ?? []) as {
			event?: { interactionType?: string };
			actions?: {
				transitionNodeID?: { sessionID: number; localID: number };
				connectionType?: string;
				connectionURL?: string;
				navigationType?: string;
			}[];
			isDeleted?: boolean;
		}[];
		const said: string[] = [];
		const to: string[] = [];
		for (const interaction of interactions) {
			if (interaction.isDeleted === true) continue;
			const on = (interaction.event?.interactionType ?? "ON_CLICK")
				.replace(/^ON_/u, "")
				.toLowerCase()
				.replaceAll("_", " ");
			for (const action of interaction.actions ?? []) {
				if (action.connectionType === "BACK") said.push(`→ back (${on})`);
				else if (action.connectionType === "URL" && action.connectionURL)
					said.push(`→ ${action.connectionURL} (${on})`);
				else {
					const target = topOf.get(idOf(action.transitionNodeID));
					const name = target === undefined ? undefined : names.get(target);
					if (name === undefined || target === from) continue;
					const how =
						action.navigationType === undefined || action.navigationType === "NAVIGATE"
							? ""
							: `, ${action.navigationType.toLowerCase().replaceAll("_", " ")}`;
					said.push(`→ "${name}" (${on}${how})`);
					to.push(name);
				}
			}
		}
		return { line: said.join(" "), to };
	};

	/**
	 * What an instance's component is drawn with, by layer id: the overrides handed down from instances further out
	 * (keyed `<this instance>/<layer>`), then the instance's own, then what Figma derived for it (resized layers).
	 */
	const instanceOverrides = (instance: FigNode, outer: Overrides): Overrides => {
		const prefix = `${nodeId(instance) ?? ""}/`;
		const merged = new Map<string, Record<string, unknown>>();
		for (const [key, value] of outer) if (key.startsWith(prefix)) merged.set(key.slice(prefix.length), value);
		type Override = { guidPath?: { guids?: { sessionID: number; localID: number }[] } } & Record<string, unknown>;
		const own = (instance.symbolData as { symbolOverrides?: Override[] } | undefined)?.symbolOverrides ?? [];
		const derived = (instance.derivedSymbolData as Override[] | undefined) ?? [];
		for (const one of [...own, ...derived]) {
			const key = (one.guidPath?.guids ?? []).map(idOf).join("/");
			if (key === "") continue;
			const { guidPath: _, ...fields } = one;
			// what was set further out wins over what is set nearer
			merged.set(key, { ...fields, ...(merged.get(key) ?? {}) });
		}
		return merged;
	};

	const icons = new Map<string, string>();
	const iconish = (node: FigNode, kids: (node: FigNode) => FigNode[]): boolean => {
		if (ICONISH.has(node.type)) return true;
		if (!CONTAINERS.has(node.type) || node.type === "SECTION") return false;
		const inside = kids(node).filter((child) => child.visible !== false);
		return inside.length > 0 && inside.every((child) => iconish(child, kids) || SHAPES.has(child.type));
	};
	/** a vector, or a small frame of nothing but shapes, as one SVG file */
	const iconFile = (root: FigNode, kids: (node: FigNode) => FigNode[]): string | undefined => {
		const w = root.size?.x ?? 0;
		const h = root.size?.y ?? 0;
		const parts: string[] = [];
		const draw = (node: FigNode, matrix: Matrix) => {
			if (node.visible === false) return;
			const at = node === root ? matrix : multiply(matrix, matrixOf(node));
			if (SHAPES.has(node.type)) {
				const resolvedPaths = (() => {
					try {
						return resolveVectorNodePaths(doc, node);
					} catch {
						return { fill: [], stroke: [] };
					}
				})();
				const transform = isIdentity(at) ? "" : ` transform="matrix(${at.map(round).join(" ")})"`;
				const fill = solid(node.fillPaints);
				const stroke = solid(node.strokePaints);
				for (const path of resolvedPaths.fill)
					parts.push(
						`<path d="${path.svgPath}" fill="${solid(path.paints) ?? fill ?? "currentColor"}"${rule(path.windingRule)}${transform}/>`,
					);
				for (const path of resolvedPaths.stroke)
					parts.push(`<path d="${path.svgPath}" fill="${stroke ?? "currentColor"}"${transform}/>`);
				return;
			}
			for (const child of kids(node)) draw(child, at);
		};
		draw(root, [1, 0, 0, 1, 0, 0]);
		if (parts.length === 0) return undefined;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px(w)}" height="${px(h)}" viewBox="0 0 ${px(w)} ${px(h)}" fill="none">${parts.join("")}</svg>\n`;
		const digest = createHash("sha1").update(svg).digest("hex").slice(0, 8);
		const known = icons.get(digest);
		if (known !== undefined) return known;
		const path = `icons/${slugOf(root.name, "icon")}-${digest}.svg`;
		icons.set(digest, path);
		files.set(path, Buffer.from(svg));
		return path;
	};

	const outlineOf = (frame: FigNode) => {
		const lines: string[] = [];
		const to = new Set<string>();
		const frameId = nodeId(frame) ?? "";
		const walk = (raw: FigNode, depth: number, parent: FigNode | null, overrides: Overrides) => {
			const override = overrides.get(nodeId(raw) ?? "");
			const node = override === undefined ? raw : ({ ...raw, ...override } as FigNode);
			if (node.visible === false || SKIPPED.has(node.type)) return;
			const flows =
				parent?.stackMode !== undefined && parent.stackMode !== "NONE" && node.stackPositioning !== "ABSOLUTE";
			const isInstance = node.type === "INSTANCE";
			const symbol = isInstance
				? doc.nodeMap.get(
						idOf(
							(node.symbolData as { symbolID?: { sessionID: number; localID: number } } | undefined)?.symbolID,
						),
					)
				: undefined;
			const inner = isInstance ? instanceOverrides(node, overrides) : overrides;
			const kids = (of: FigNode): FigNode[] =>
				of === node && symbol !== undefined ? children(symbol) : children(of);
			const words: string[] = [];
			const kind =
				node.type === "SYMBOL"
					? "component"
					: node.type === "FRAME" && node.resizeToFit === true
						? "group"
						: node.type === "ROUNDED_RECTANGLE"
							? "rect"
							: node.type.toLowerCase().replaceAll("_", "-");
			// a text layer is its words, and its name only where someone gave it one of its own
			const characters = node.type === "TEXT" ? (node.textData?.characters ?? "") : undefined;
			if (isInstance) words.push(`instance of "${symbol?.name ?? node.name}"`);
			else if (characters === undefined) words.push(`${kind} "${node.name}"`);
			else words.push(node.autoRename === true || node.name === characters ? "text" : `text "${node.name}"`);
			if (isInstance && node.name !== symbol?.name) words.push(`as "${node.name}"`);
			if (node.size) words.push(`${px(node.size.x)}×${px(node.size.y)}`);
			if (parent !== null && !flows && node.transform)
				words.push(`@${px(node.transform.m02)},${px(node.transform.m12)}`);
			const angle = node.transform
				? Math.round((Math.atan2(node.transform.m10, node.transform.m00) * 180) / Math.PI)
				: 0;
			if (angle !== 0) words.push(`rotate ${angle}°`);
			if (flows) {
				if ((node.stackChildPrimaryGrow ?? 0) > 0) words.push("grow");
				if (node.stackChildAlignSelf === "STRETCH") words.push("stretch");
			} else if (parent !== null && parent.type !== "CANVAS") {
				const pins = [constraint("x", node.horizontalConstraint), constraint("y", node.verticalConstraint)].filter(
					Boolean,
				);
				if (pins.length > 0) words.push(pins.join(" "));
			}
			if (node.stackMode !== undefined && node.stackMode !== "NONE") words.push(...layoutOf(node));
			if (characters !== undefined) words[0] = `${words[0]} ${JSON.stringify(characters)}`;
			if (node.type === "TEXT") words.push(...textOf(node));
			if (node.type !== "TEXT") {
				const fills = paints(node.fillPaints);
				if (fills.length > 0) words.push(`fill ${fills.join(" + ")}`);
			}
			const strokes = paints(node.strokePaints);
			if (strokes.length > 0 && (node.strokeWeight ?? 0) > 0)
				words.push(
					`border ${px(node.strokeWeight ?? 0)} ${strokes.join(" + ")}${node.strokeAlign && node.strokeAlign !== "INSIDE" ? ` ${node.strokeAlign.toLowerCase()}` : ""}${(node.dashPattern as number[] | undefined)?.length ? " dashed" : ""}`,
				);
			const radius = radiusOf(node);
			if (radius !== "") words.push(radius);
			if (node.opacity !== undefined && node.opacity < 1) words.push(`opacity ${round(node.opacity)}`);
			for (const effect of (node.effects ?? []) as {
				type: string;
				visible?: boolean;
				color?: FigPaint["color"];
				offset?: { x: number; y: number };
				radius?: number;
				spread?: number;
			}[]) {
				if (effect.visible === false) continue;
				if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW")
					words.push(
						`${effect.type === "INNER_SHADOW" ? "inner-shadow" : "shadow"} ${px(effect.offset?.x ?? 0)} ${px(effect.offset?.y ?? 0)} ${px(effect.radius ?? 0)}${effect.spread ? ` ${px(effect.spread)}` : ""} ${colour(effect.color)}`,
					);
				else if (effect.type === "FOREGROUND_BLUR" || effect.type === "LAYER_BLUR")
					words.push(`blur ${px(effect.radius ?? 0)}`);
				else if (effect.type === "BACKGROUND_BLUR") words.push(`backdrop-blur ${px(effect.radius ?? 0)}`);
			}
			if (
				node.type === "FRAME" &&
				node.resizeToFit !== true &&
				node.frameMaskDisabled === false &&
				kids(node).length > 0
			)
				words.push("clip");
			if (node.mask === true) words.push("mask");
			const link = linksOf(node, frameId);
			for (const target of link.to) to.add(target);
			// a vector, or a frame of nothing but shapes small enough to be an icon, is one SVG file
			const icon =
				depth > 0 &&
				(ICONISH.has(node.type) ||
					((node.size?.x ?? ICON_MAX + 1) <= ICON_MAX &&
						(node.size?.y ?? ICON_MAX + 1) <= ICON_MAX &&
						iconish(node, kids)));
			if (icon) {
				const file = iconFile(node, kids);
				lines.push(
					`${"  ".repeat(depth)}${isInstance ? words[0] : `svg "${node.name}"`} ${node.size ? `${px(node.size.x)}×${px(node.size.y)} ` : ""}${parent !== null && !flows && node.transform ? `@${px(node.transform.m02)},${px(node.transform.m12)} ` : ""}${file ?? "(no paths)"}${link.line ? ` ${link.line}` : ""}`,
				);
				return;
			}
			if (link.line) words.push(link.line);
			lines.push(`${"  ".repeat(depth)}${words.join("  ")}`);
			for (const child of kids(node)) walk(child, depth + 1, node, inner);
		};
		walk(frame, 0, null, new Map());
		return { text: `${lines.join("\n")}\n`, links: [...to] };
	};

	const taken = new Set<string>();
	const result = tops.map(({ page, frames }) => {
		const pageSlug = unique(slugOf(page.name, "page"), taken);
		const used = new Set<string>();
		const outlines = new Map<string, string>();
		const listed = frames.map((frame): ImportedFrame => {
			const file = `${pageSlug}/${unique(slugOf(frame.name), used)}.txt`;
			const { text, links } = outlineOf(frame);
			outlines.set(file, text);
			return {
				name: frame.name,
				kind: frame.type === "SYMBOL" || frame.isStateGroup === true ? "component" : "frame",
				w: Math.round(frame.size?.x ?? 0),
				h: Math.round(frame.size?.y ?? 0),
				outline: file,
				links,
			};
		});
		return { name: page.name, frames: listed, outlines };
	});
	const meta = doc.meta as { file_name?: unknown } | undefined;
	const name =
		typeof meta?.file_name === "string" && meta.file_name.trim() !== "" ? meta.file_name.trim() : fallbackName;
	return { source: "Figma", name, pages: result.filter((page) => page.frames.length > 0), files };
}

type Matrix = [number, number, number, number, number, number];
function matrixOf(node: FigNode): Matrix {
	const t = node.transform;
	return t === undefined ? [1, 0, 0, 1, 0, 0] : [t.m00, t.m10, t.m01, t.m11, t.m02, t.m12];
}
function multiply([a, b, c, d, e, f]: Matrix, [A, B, C, D, E, F]: Matrix): Matrix {
	return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}
const isIdentity = (m: Matrix) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
const rule = (winding: string | undefined) => (winding === "EVENODD" ? ` fill-rule="evenodd"` : "");
function solid(list: readonly FigPaint[] | undefined): string | undefined {
	const paint = (list ?? []).find((one) => one.visible !== false && one.type === "SOLID");
	if (paint?.color === undefined) return undefined;
	const alpha = round((paint.color.a ?? 1) * (paint.opacity ?? 1));
	return alpha >= 1 ? hex(paint.color) : `${hex(paint.color)}" fill-opacity="${alpha}`;
}

function constraint(axis: "x" | "y", value: string | undefined): string {
	if (value === undefined || value === "MIN") return "";
	const words: Record<string, string> =
		axis === "x"
			? { MAX: "pin right", CENTER: "pin center-x", STRETCH: "pin left+right", SCALE: "scale x" }
			: { MAX: "pin bottom", CENTER: "pin center-y", STRETCH: "pin top+bottom", SCALE: "scale y" };
	return words[value] ?? "";
}

function layoutOf(node: FigNode): string[] {
	const words = [node.stackMode === "VERTICAL" ? "column" : node.stackMode === "GRID" ? "grid" : "row"];
	if (node.stackWrap === "WRAP") words.push("wrap");
	if (node.stackPrimaryAlignItems === "SPACE_BETWEEN") words.push("gap auto");
	else if ((node.stackSpacing ?? 0) !== 0) words.push(`gap ${px(node.stackSpacing)}`);
	const pad = [
		node.stackVerticalPadding,
		node.stackPaddingRight,
		node.stackPaddingBottom,
		node.stackHorizontalPadding,
	].map((n) => n ?? 0);
	const [top, right, bottom, left] = pad as [number, number, number, number];
	if (pad.some((n) => n !== 0))
		words.push(
			`pad ${top === bottom && left === right ? (top === left ? px(top) : `${px(top)} ${px(left)}`) : pad.map(px).join(" ")}`,
		);
	const place: Record<string, string> = {
		MIN: "start",
		CENTER: "center",
		MAX: "end",
		BASELINE: "baseline",
		SPACE_EVENLY: "evenly",
		SPACE_BETWEEN: "between",
	};
	const justify = place[node.stackPrimaryAlignItems ?? "MIN"] ?? "start";
	const align = place[node.stackCounterAlignItems ?? "MIN"] ?? "start";
	if (justify !== "start" && justify !== "between") words.push(`justify ${justify}`);
	if (align !== "start") words.push(`align ${align}`);
	const hug = (sizing: string | undefined) => sizing?.startsWith("RESIZE_TO_FIT") === true;
	const width = node.stackMode === "VERTICAL" ? node.stackCounterSizing : node.stackPrimarySizing;
	const height = node.stackMode === "VERTICAL" ? node.stackPrimarySizing : node.stackCounterSizing;
	if (hug(width) && hug(height)) words.push("hug");
	else if (hug(width)) words.push("hug width");
	else if (hug(height)) words.push("hug height");
	return words;
}

function textOf(node: FigNode): string[] {
	const words: string[] = [];
	const font = node.fontName as { family?: string; style?: string } | undefined;
	words.push(`${font?.family ?? "?"} ${font?.style ?? "Regular"} ${px(node.fontSize ?? 0)}`);
	const line = node.lineHeight as { value?: number; units?: string } | undefined;
	if (line?.units === "PIXELS") words.push(`line ${px(line.value ?? 0)}`);
	else if (line?.units === "PERCENT" && line.value !== 100) words.push(`line ${round(line.value ?? 100)}%`);
	else if (line?.units === "RAW") words.push(`line ${round(line.value ?? 1)}`);
	const spacing = node.letterSpacing as { value?: number; units?: string } | undefined;
	if (spacing?.value) words.push(`tracking ${round(spacing.value)}${spacing.units === "PERCENT" ? "%" : ""}`);
	const fills = (node.fillPaints ?? []).filter((paint: FigPaint) => paint.visible !== false && paint.type === "SOLID");
	if (fills[0]) words.push(colour(fills[0].color, fills[0].opacity ?? 1));
	if (node.textAlignHorizontal && node.textAlignHorizontal !== "LEFT")
		words.push(node.textAlignHorizontal.toLowerCase());
	if (node.textCase && node.textCase !== "ORIGINAL") words.push(String(node.textCase).toLowerCase());
	if (node.textDecoration && node.textDecoration !== "NONE") words.push(String(node.textDecoration).toLowerCase());
	if (node.textAutoResize === "WIDTH_AND_HEIGHT") words.push("hug");
	else if (node.textAutoResize === "HEIGHT") words.push("hug height");
	if (((node.textData as { styleOverrideTable?: unknown[] } | undefined)?.styleOverrideTable ?? []).length > 0)
		words.push("mixed styles");
	return words;
}

function radiusOf(node: FigNode): string {
	const corners = [
		node.rectangleTopLeftCornerRadius,
		node.rectangleTopRightCornerRadius,
		node.rectangleBottomRightCornerRadius,
		node.rectangleBottomLeftCornerRadius,
	] as (number | undefined)[];
	if (corners.some((n) => n !== undefined) && new Set(corners).size > 1)
		return `radius ${corners.map((n) => px(n ?? 0)).join(" ")}`;
	if (node.type === "ELLIPSE") return "round";
	return node.cornerRadius ? `radius ${px(node.cornerRadius)}` : "";
}

function imageExtension(bytes: Uint8Array): string {
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
	if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
	if (Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") return "webp";
	return "png";
}
