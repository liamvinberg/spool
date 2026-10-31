// spool#219 "own engine" spike: React's reconciler driving our own renderer.
// Layout: Yoga (the flexbox engine React Native uses). Paint: Skia through CanvasKit on a WebGL surface.
// Vocabulary: View, Text, Image, Svg, Path, with React Native style objects plus a few web extras
// (boxShadow, backgroundImage linear-gradient, cursor). Nothing here is the DOM.
import Reconciler from "react-reconciler";
import { DefaultEventPriority, ConcurrentRoot } from "react-reconciler/constants";
import Yoga, { Align, Direction, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, Overflow, PositionType, Wrap } from "yoga-layout";
import { createContext, createElement } from "react";

let CK; // CanvasKit
let fontMgr, fontProvider;
const images = new Map(); // src -> SkImage | "loading"
let requestFrame = () => {};

// ---------- nodes ----------
class Node {
	constructor(type, props) {
		this.type = type;
		this.props = props;
		this.children = [];
		this.parent = null;
		this.yoga = Yoga.Node.create();
		this.text = null; // for raw text
		if (type === "Text") this.yoga.setMeasureFunc((w, wm) => this.measure(w, wm));
		applyLayoutStyle(this);
	}
	measure(width, widthMode) {
		const p = buildParagraph(this);
		const max = widthMode === MeasureMode.Undefined ? 1e6 : width;
		p.layout(max);
		const w = Math.min(max, Math.ceil(p.getMaxIntrinsicWidth()));
		p.layout(widthMode === MeasureMode.Exactly ? width : w);
		const size = { width: widthMode === MeasureMode.Exactly ? width : w, height: p.getHeight() };
		p.delete();
		return size;
	}
}
class RawText {
	constructor(text) {
		this.text = text;
		this.parent = null;
		this.type = "#text";
	}
}

// ---------- style ----------
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.endsWith("%") ? v : v === undefined ? undefined : parseFloat(v));
function setEdge(set, edge, v) {
	if (v === undefined) return;
	if (typeof v === "string" && v.endsWith("%")) set(edge, v);
	else if (v === "auto") set(edge, "auto");
	else set(edge, num(v));
}
function applyLayoutStyle(node) {
	const y = node.yoga;
	const s = flat(node.props.style);
	if (node.type === "Text" && node.parent?.type === "Text") return;
	y.setFlexDirection(
		{ row: FlexDirection.Row, column: FlexDirection.Column, "row-reverse": FlexDirection.RowReverse, "column-reverse": FlexDirection.ColumnReverse }[
			s.flexDirection ?? "column"
		],
	);
	y.setJustifyContent(
		{ "flex-start": Justify.FlexStart, center: Justify.Center, "flex-end": Justify.FlexEnd, "space-between": Justify.SpaceBetween, "space-around": Justify.SpaceAround, "space-evenly": Justify.SpaceEvenly }[
			s.justifyContent ?? "flex-start"
		],
	);
	const al = { "flex-start": Align.FlexStart, center: Align.Center, "flex-end": Align.FlexEnd, stretch: Align.Stretch, baseline: Align.Baseline, auto: Align.Auto, "space-between": Align.SpaceBetween };
	y.setAlignItems(al[s.alignItems ?? "stretch"]);
	y.setAlignSelf(al[s.alignSelf ?? "auto"]);
	if (s.alignContent) y.setAlignContent(al[s.alignContent]);
	y.setFlexWrap(s.flexWrap === "wrap" ? Wrap.Wrap : Wrap.NoWrap);
	if (s.flex !== undefined) y.setFlex(s.flex);
	y.setFlexGrow(s.flexGrow ?? (s.flex > 0 ? s.flex : 0));
	y.setFlexShrink(s.flexShrink ?? (s.flex > 0 ? 1 : 0));
	if (s.flexBasis !== undefined) y.setFlexBasis(num(s.flexBasis));
	y.setPositionType(s.position === "absolute" ? PositionType.Absolute : PositionType.Relative);
	y.setDisplay(s.display === "none" ? Display.None : Display.Flex);
	y.setOverflow(s.overflow === "hidden" ? Overflow.Hidden : Overflow.Visible);
	for (const [k, fn] of [
		["width", "setWidth"],
		["height", "setHeight"],
		["minWidth", "setMinWidth"],
		["minHeight", "setMinHeight"],
		["maxWidth", "setMaxWidth"],
		["maxHeight", "setMaxHeight"],
	])
		y[fn](s[k] === undefined ? undefined : num(s[k]));
	if (s.aspectRatio) y.setAspectRatio(s.aspectRatio);
	const pos = (e, v) => y.setPosition(e, v);
	setEdge(pos, Edge.Top, s.top);
	setEdge(pos, Edge.Left, s.left);
	setEdge(pos, Edge.Right, s.right);
	setEdge(pos, Edge.Bottom, s.bottom);
	if (s.inset !== undefined) for (const e of [Edge.Top, Edge.Left, Edge.Right, Edge.Bottom]) setEdge(pos, e, s.inset);
	const box = (prefix, setter) => {
		const set = (e, v) => y[setter](e, v);
		setEdge(set, Edge.All, s[prefix]);
		setEdge(set, Edge.Horizontal, s[`${prefix}Horizontal`]);
		setEdge(set, Edge.Vertical, s[`${prefix}Vertical`]);
		setEdge(set, Edge.Top, s[`${prefix}Top`]);
		setEdge(set, Edge.Bottom, s[`${prefix}Bottom`]);
		setEdge(set, Edge.Left, s[`${prefix}Left`]);
		setEdge(set, Edge.Right, s[`${prefix}Right`]);
	};
	box("padding", "setPadding");
	box("margin", "setMargin");
	const bw = s.borderWidth ?? 0;
	y.setBorder(Edge.All, bw);
	for (const [k, e] of [["borderTopWidth", Edge.Top], ["borderBottomWidth", Edge.Bottom], ["borderLeftWidth", Edge.Left], ["borderRightWidth", Edge.Right]])
		if (s[k] !== undefined) y.setBorder(e, s[k]);
	if (s.gap !== undefined) y.setGap(Gutter.All, s.gap);
	if (s.rowGap !== undefined) y.setGap(Gutter.Row, s.rowGap);
	if (s.columnGap !== undefined) y.setGap(Gutter.Column, s.columnGap);
	if (node.type === "Image" || node.type === "Svg") {
		if (node.props.width !== undefined && s.width === undefined) y.setWidth(node.props.width);
		if (node.props.height !== undefined && s.height === undefined) y.setHeight(node.props.height);
	}
	if (node.type === "Text") y.markDirty?.();
}
function flat(style) {
	if (!style) return {};
	if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
	return style;
}

// colours: #rgb #rrggbb #rrggbbaa rgb() rgba() hsl() named basics
const NAMED = { white: "#ffffff", black: "#000000", transparent: "#00000000", red: "#ff0000", blue: "#0000ff", green: "#008000" };
function color(c) {
	if (c === undefined || c === null) return null;
	if (NAMED[c]) c = NAMED[c];
	return CK.parseColorString(c);
}

// ---------- text ----------
function textStyleOf(s, inherited) {
	const st = { ...inherited };
	for (const k of ["color", "fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing", "textAlign", "fontStyle", "textDecorationLine", "fontVariant", "textTransform"])
		if (s[k] !== undefined) st[k] = s[k];
	return st;
}
function ckTextStyle(st) {
	const size = st.fontSize ?? 14;
	const weight = Number(st.fontWeight ?? 400);
	const fam = st.fontFamily ?? "Inter";
	return new CK.TextStyle({
		color: color(st.color ?? "#000"),
		fontSize: size,
		fontFamilies: [fam, "Inter"],
		fontStyle: { weight: { value: weight }, slant: st.fontStyle === "italic" ? CK.FontSlant.Italic : CK.FontSlant.Upright },
		fontVariations: [{ axis: "wght", value: weight }],
		heightMultiplier: st.lineHeight ? st.lineHeight / size : undefined,
		halfLeading: true,
		letterSpacing: st.letterSpacing ?? 0,
		decoration: st.textDecorationLine === "underline" ? CK.UnderlineDecoration : st.textDecorationLine === "line-through" ? CK.LineThroughDecoration : 0,
		fontFeatures: st.fontVariant?.includes?.("tabular-nums") ? [{ name: "tnum", value: 1 }] : undefined,
	});
}
function buildParagraph(node) {
	const root = flat(node.props.style);
	const inherited = inheritedTextStyle(node);
	const base = textStyleOf(root, inherited);
	const ps = new CK.ParagraphStyle({
		textStyle: ckTextStyle(base),
		textAlign: { left: CK.TextAlign.Left, center: CK.TextAlign.Center, right: CK.TextAlign.Right }[base.textAlign ?? "left"],
		maxLines: node.props.numberOfLines,
		ellipsis: node.props.numberOfLines ? "…" : undefined,
	});
	const b = CK.ParagraphBuilder.MakeFromFontProvider(ps, fontProvider);
	const walk = (n, st) => {
		for (const c of n.children) {
			if (c instanceof RawText) {
				b.pushStyle(ckTextStyle(st));
				const t = st.textTransform === "uppercase" ? c.text.toUpperCase() : c.text;
				b.addText(t);
				b.pop();
			} else if (c.type === "Text") walk(c, textStyleOf(flat(c.props.style), st));
		}
	};
	walk(node, base);
	const p = b.build();
	b.delete();
	return p;
}
function inheritedTextStyle(node) {
	// Text inside View inherits nothing (React Native rule); nested Text handled in walk
	return {};
}

// ---------- paint ----------
function parseShadows(str) {
	if (!str) return [];
	return str
		.split(/,(?![^(]*\))/)
		.map((p) => p.trim())
		.map((p) => {
			const inset = /\binset\b/.test(p);
			const col = p.match(/(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8})/)?.[0] ?? "rgba(0,0,0,0.25)";
			const nums = p.replace(col, "").replace("inset", "").trim().split(/\s+/).filter(Boolean).map(parseFloat);
			const [x = 0, y = 0, blur = 0, spread = 0] = nums;
			return { inset, x, y, blur, spread, color: col };
		});
}
function gradientShader(str, w, h) {
	const m = str.match(/linear-gradient\((.*)\)$/s);
	if (!m) return null;
	const parts = m[1].split(/,(?![^(]*\))/).map((s) => s.trim());
	let angle = 180;
	if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift());
	else if (/^to /.test(parts[0])) {
		const d = parts.shift();
		angle = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270, "to bottom right": 135, "to top right": 45, "to bottom left": 225, "to top left": 315 }[d] ?? 180;
	}
	const stops = parts.map((p, i) => {
		const pm = p.match(/^(.*?)(?:\s+([\d.]+)%)?$/);
		return { c: color(pm[1].trim()), at: pm[2] !== undefined ? pm[2] / 100 : i / Math.max(1, parts.length - 1) };
	});
	const rad = ((angle - 90) * Math.PI) / 180;
	const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
	const cx = w / 2,
		cy = h / 2;
	const dx = (Math.cos(rad) * len) / 2,
		dy = (Math.sin(rad) * len) / 2;
	return CK.Shader.MakeLinearGradient([cx - dx, cy - dy], [cx + dx, cy + dy], stops.map((s) => s.c), stops.map((s) => s.at), CK.TileMode.Clamp);
}
function radii(s, w, h) {
	const r = Math.min(num(s.borderRadius ?? 0), w / 2, h / 2);
	const g = (k) => Math.min(s[k] ?? r, w / 2, h / 2);
	return [g("borderTopLeftRadius"), g("borderTopRightRadius"), g("borderBottomRightRadius"), g("borderBottomLeftRadius")];
}
function rrect(x, y, w, h, rs) {
	return Float32Array.of(x, y, x + w, y + h, rs[0], rs[0], rs[1], rs[1], rs[2], rs[2], rs[3], rs[3]);
}
function applyTransform(canvas, t, w, h, origin) {
	if (!t) return;
	const list = typeof t === "string" ? parseCssTransform(t) : t;
	const [ox, oy] = origin ?? [w / 2, h / 2];
	canvas.translate(ox, oy);
	for (const op of list) {
		const [k, v] = Object.entries(op)[0];
		const deg = (x) => (typeof x === "string" ? (x.endsWith("rad") ? (parseFloat(x) * 180) / Math.PI : parseFloat(x)) : x);
		if (k === "translateX") canvas.translate(num(v), 0);
		else if (k === "translateY") canvas.translate(0, num(v));
		else if (k === "scale") canvas.scale(v, v);
		else if (k === "scaleX") canvas.scale(v, 1);
		else if (k === "scaleY") canvas.scale(1, v);
		else if (k === "rotate" || k === "rotateZ") canvas.rotate(deg(v), 0, 0);
		else if (k === "skewX") canvas.skew(Math.tan((deg(v) * Math.PI) / 180), 0);
	}
	canvas.translate(-ox, -oy);
}
function parseCssTransform(str) {
	const out = [];
	for (const m of str.matchAll(/(\w+)\(([^)]*)\)/g)) {
		const args = m[2].split(/[ ,]+/).filter(Boolean);
		if (m[1] === "translate") {
			out.push({ translateX: parseFloat(args[0]) }, { translateY: parseFloat(args[1] ?? 0) });
		} else if (m[1] === "scale") out.push({ scale: parseFloat(args[0]) });
		else out.push({ [m[1]]: m[1].startsWith("rotate") || m[1].startsWith("skew") ? args[0] : parseFloat(args[0]) });
	}
	return out;
}

const paint = { fill: null, stroke: null };
function paintNode(canvas, node, ox, oy) {
	if (node instanceof RawText) return;
	const y = node.yoga;
	if (y.getDisplay() === Display.None) return;
	const L = y.getComputedLayout();
	const x0 = ox + L.left,
		y0 = oy + L.top,
		w = L.width,
		h = L.height;
	node.box = { x: x0, y: y0, w, h };
	const s = flat(node.props.style);
	const opacity = s.opacity ?? 1;
	if (opacity <= 0) return;
	canvas.save();
	canvas.translate(x0, y0);
	applyTransform(canvas, s.transform, w, h);
	if (opacity < 1) {
		const p = new CK.Paint();
		p.setAlphaf(opacity);
		canvas.saveLayer(p);
		p.delete();
	}
	const rs = radii(s, w, h);
	// outer shadows
	for (const sh of parseShadows(s.boxShadow).filter((x) => !x.inset)) {
		const p = new CK.Paint();
		p.setColor(color(sh.color));
		p.setAntiAlias(true);
		if (sh.blur > 0) p.setMaskFilter(CK.MaskFilter.MakeBlur(CK.BlurStyle.Normal, sh.blur / 2, false));
		canvas.drawRRect(rrect(sh.x - sh.spread, sh.y - sh.spread, w + sh.spread * 2, h + sh.spread * 2, rs.map((r) => r + sh.spread)), p);
		p.delete();
	}
	// background
	if (s.backgroundColor || s.backgroundImage) {
		const p = new CK.Paint();
		p.setAntiAlias(true);
		if (s.backgroundColor) {
			p.setColor(color(s.backgroundColor));
			canvas.drawRRect(rrect(0, 0, w, h, rs), p);
		}
		if (s.backgroundImage) {
			const sh = gradientShader(s.backgroundImage, w, h);
			if (sh) {
				p.setColor(CK.WHITE);
				p.setShader(sh);
				canvas.drawRRect(rrect(0, 0, w, h, rs), p);
				sh.delete();
			}
		}
		p.delete();
	}
	// image
	if (node.type === "Image") drawImage(canvas, node, w, h, rs, s);
	if (node.type === "Svg") drawSvg(canvas, node, w, h);
	// inset shadows
	for (const sh of parseShadows(s.boxShadow).filter((x) => x.inset)) {
		canvas.save();
		canvas.clipRRect(rrect(0, 0, w, h, rs), CK.ClipOp.Intersect, true);
		const p = new CK.Paint();
		p.setColor(color(sh.color));
		p.setAntiAlias(true);
		if (sh.blur > 0) p.setMaskFilter(CK.MaskFilter.MakeBlur(CK.BlurStyle.Normal, sh.blur / 2, false));
		p.setStyle(CK.PaintStyle.Stroke);
		p.setStrokeWidth(Math.max(1, sh.blur + sh.spread * 2));
		canvas.drawRRect(rrect(sh.x, sh.y, w, h, rs), p);
		p.delete();
		canvas.restore();
	}
	// text
	if (node.type === "Text" && node.parent?.type !== "Text") {
		const para = buildParagraph(node);
		const pad = { l: y.getComputedPadding(Edge.Left), t: y.getComputedPadding(Edge.Top), r: y.getComputedPadding(Edge.Right), b: y.getComputedBorder(Edge.Left) };
		para.layout(Math.max(1, w - pad.l - pad.r - 2 * pad.b) + 0.5);
		canvas.drawParagraph(para, pad.l + pad.b, pad.t + pad.b);
		para.delete();
	}
	// children
	const clip = s.overflow === "hidden";
	if (clip) {
		canvas.save();
		canvas.clipRRect(rrect(0, 0, w, h, rs), CK.ClipOp.Intersect, true);
	}
	if (node.type !== "Text" && node.type !== "Svg") {
		const kids = node.children.filter((c) => !(c instanceof RawText));
		const order = kids.map((c, i) => [flat(c.props.style).zIndex ?? 0, i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		for (const [, , c] of order) paintNode(canvas, c, 0, 0);
	}
	if (clip) canvas.restore();
	// border on top
	const bw = s.borderWidth;
	if (bw && (s.borderColor || true)) {
		const p = new CK.Paint();
		p.setAntiAlias(true);
		p.setStyle(CK.PaintStyle.Stroke);
		p.setStrokeWidth(bw);
		p.setColor(color(s.borderColor ?? "#000"));
		if (s.borderStyle === "dashed") p.setPathEffect(CK.PathEffect.MakeDash([bw * 3, bw * 2], 0));
		canvas.drawRRect(rrect(bw / 2, bw / 2, w - bw, h - bw, rs.map((r) => Math.max(0, r - bw / 2))), p);
		p.delete();
	}
	for (const [k, side] of [["borderTopWidth", "t"], ["borderBottomWidth", "b"], ["borderLeftWidth", "l"], ["borderRightWidth", "r"]]) {
		const v = s[k];
		if (!v || bw) continue;
		const p = new CK.Paint();
		p.setColor(color(s[k.replace("Width", "Color")] ?? s.borderColor ?? "#000"));
		const r = { t: [0, 0, w, v], b: [0, h - v, w, h], l: [0, 0, v, h], r: [w - v, 0, w, h] }[side];
		canvas.drawRect(Float32Array.of(...r), p);
		p.delete();
	}
	if (opacity < 1) canvas.restore();
	canvas.restore();
}
function drawImage(canvas, node, w, h, rs, s) {
	const src = node.props.source?.uri ?? node.props.src;
	if (!src) return;
	const img = images.get(src);
	if (!img) {
		images.set(src, "loading");
		fetch(src)
			.then((r) => r.arrayBuffer())
			.then((b) => {
				images.set(src, CK.MakeImageFromEncoded(new Uint8Array(b)));
				requestFrame(true);
			})
			.catch(() => images.set(src, "failed"));
		return;
	}
	if (typeof img === "string") return;
	const iw = img.width(),
		ih = img.height();
	const mode = node.props.resizeMode ?? s.objectFit ?? "cover";
	let sc = mode === "contain" ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
	if (mode === "stretch") sc = 1;
	const dw = mode === "stretch" ? w : iw * sc,
		dh = mode === "stretch" ? h : ih * sc;
	canvas.save();
	canvas.clipRRect(rrect(0, 0, w, h, rs), CK.ClipOp.Intersect, true);
	const p = new CK.Paint();
	p.setAntiAlias(true);
	canvas.drawImageRectOptions(img, Float32Array.of(0, 0, iw, ih), Float32Array.of((w - dw) / 2, (h - dh) / 2, (w + dw) / 2, (h + dh) / 2), CK.FilterMode.Linear, CK.MipmapMode.Linear, p);
	p.delete();
	canvas.restore();
}
function drawSvg(canvas, node, w, h) {
	const vb = (node.props.viewBox ?? `0 0 ${w} ${h}`).split(/[ ,]+/).map(Number);
	canvas.save();
	canvas.scale(w / vb[2], h / vb[3]);
	canvas.translate(-vb[0], -vb[1]);
	const walk = (n, inh) => {
		for (const c of n.children) {
			if (c instanceof RawText) continue;
			const pr = { ...inh, ...Object.fromEntries(Object.entries(c.props).filter(([k]) => ["fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "opacity"].includes(k))) };
			let path = null;
			if (c.type === "Path") path = CK.Path.MakeFromSVGString(c.props.d);
			else if (c.type === "Circle") {
				const pb = new CK.PathBuilder();
				pb.addCircle(+c.props.cx, +c.props.cy, +c.props.r);
				path = pb.detach();
				pb.delete();
			} else if (c.type === "Rect") {
				const pb = new CK.PathBuilder();
				const r = +(c.props.rx ?? 0);
				pb.addRRect(rrect(+(c.props.x ?? 0), +(c.props.y ?? 0), +c.props.width, +c.props.height, [r, r, r, r]));
				path = pb.detach();
				pb.delete();
			}
			if (path) {
				const cur = node.props.color ?? "#000";
				const res = (v) => (v === "currentColor" ? cur : v);
				if (pr.fill !== "none") {
					const p = new CK.Paint();
					p.setAntiAlias(true);
					p.setColor(color(res(pr.fill ?? "#000")));
					canvas.drawPath(path, p);
					p.delete();
				}
				if (pr.stroke && pr.stroke !== "none") {
					const p = new CK.Paint();
					p.setAntiAlias(true);
					p.setStyle(CK.PaintStyle.Stroke);
					p.setStrokeWidth(+(pr.strokeWidth ?? 1));
					p.setStrokeCap({ round: CK.StrokeCap.Round, square: CK.StrokeCap.Square }[pr.strokeLinecap] ?? CK.StrokeCap.Butt);
					p.setStrokeJoin({ round: CK.StrokeJoin.Round, bevel: CK.StrokeJoin.Bevel }[pr.strokeLinejoin] ?? CK.StrokeJoin.Miter);
					p.setColor(color(res(pr.stroke)));
					canvas.drawPath(path, p);
					p.delete();
				}
				path.delete();
			}
			if (c.type === "G") walk(c, pr);
		}
	};
	walk(node, { fill: node.props.fill, stroke: node.props.stroke, strokeWidth: node.props.strokeWidth, strokeLinecap: node.props.strokeLinecap, strokeLinejoin: node.props.strokeLinejoin });
	canvas.restore();
}

// ---------- host config ----------
const syncYogaChildren = (parent) => {
	if (parent.type === "Text" || parent.type === "Svg" || parent.type === "G") return;
	const y = parent.yoga;
	while (y.getChildCount() > 0) y.removeChild(y.getChild(0));
	let i = 0;
	for (const c of parent.children) if (!(c instanceof RawText) && c.yoga && !(c.type === "Text" && parent.type === "Text")) y.insertChild(c.yoga, i++);
};
const markText = (n) => {
	for (let p = n; p; p = p.parent) if (p.type === "Text") p.yoga.markDirty();
};
let currentPriority = DefaultEventPriority;
const host = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: true,
	noTimeout: -1,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	supportsMicrotasks: true,
	scheduleMicrotask: queueMicrotask,
	createInstance: (type, props) => new Node(type, props),
	createTextInstance: (text) => new RawText(text),
	appendInitialChild(p, c) {
		p.children.push(c);
		c.parent = p;
		syncYogaChildren(p);
	},
	finalizeInitialChildren(n) {
		applyLayoutStyle(n);
		return false;
	},
	shouldSetTextContent: () => false,
	getRootHostContext: () => ({}),
	getChildHostContext: (c) => c,
	getPublicInstance: (i) => i,
	prepareForCommit: () => null,
	resetAfterCommit: () => requestFrame(true),
	preparePortalMount() {},
	appendChild(p, c) {
		host.removeChild(p, c, true);
		p.children.push(c);
		c.parent = p;
		syncYogaChildren(p);
		markText(p);
	},
	appendChildToContainer(container, c) {
		host.appendChild(container.root, c);
	},
	insertBefore(p, c, before) {
		host.removeChild(p, c, true);
		p.children.splice(p.children.indexOf(before), 0, c);
		c.parent = p;
		syncYogaChildren(p);
		markText(p);
	},
	insertInContainerBefore(container, c, before) {
		host.insertBefore(container.root, c, before);
	},
	removeChild(p, c, keep) {
		const i = p.children.indexOf(c);
		if (i < 0) return;
		p.children.splice(i, 1);
		syncYogaChildren(p);
		markText(p);
		if (!keep && c.yoga) c.yoga.freeRecursive?.();
	},
	removeChildFromContainer(container, c) {
		host.removeChild(container.root, c);
	},
	commitUpdate(n, type, oldProps, newProps) {
		n.props = newProps;
		applyLayoutStyle(n);
		markText(n);
	},
	commitTextUpdate(t, o, text) {
		t.text = text;
		markText(t.parent);
	},
	commitMount() {},
	resetTextContent() {},
	clearContainer(container) {
		container.root.children = [];
		syncYogaChildren(container.root);
	},
	hideInstance(n) {
		n.yoga.setDisplay(Display.None);
	},
	unhideInstance(n) {
		n.yoga.setDisplay(Display.Flex);
	},
	hideTextInstance() {},
	unhideTextInstance() {},
	detachDeletedInstance() {},
	getInstanceFromNode: () => null,
	beforeActiveInstanceBlur() {},
	afterActiveInstanceBlur() {},
	prepareScopeUpdate() {},
	getInstanceFromScope: () => null,
	setCurrentUpdatePriority: (p) => (currentPriority = p),
	getCurrentUpdatePriority: () => currentPriority,
	resolveUpdatePriority: () => currentPriority || DefaultEventPriority,
	maySuspendCommit: () => false,
	maySuspendCommitOnUpdate: () => false,
	maySuspendCommitInSyncRender: () => false,
	preloadInstance: () => true,
	startSuspendingCommit() {},
	suspendInstance() {},
	waitForCommitToBeReady: () => null,
	NotPendingTransition: null,
	HostTransitionContext: createContext(null),
	resetFormInstance() {},
	requestPostPaintCallback() {},
	shouldAttemptEagerTransition: () => false,
	trackSchedulerEvent() {},
	resolveEventType: () => null,
	resolveEventTimeStamp: () => Date.now(),
	rendererVersion: "0.0.1",
	rendererPackageName: "spool-own-engine-spike",
	extraDevToolsConfig: null,
};
const R = Reconciler(host);

// ---------- components ----------
export const View = (p) => createElement("View", p);
export const Text = (p) => createElement("Text", p);
export const Image = (p) => createElement("Image", p);
export const Svg = (p) => createElement("Svg", p);
export const Path = (p) => createElement("Path", p);
export const Circle = (p) => createElement("Circle", p);
export const Rect = (p) => createElement("Rect", p);
export const G = (p) => createElement("G", p);
export const Pressable = (p) => createElement("View", p);

// ---------- mount ----------
export async function mount(canvasEl, element, { width, height, dpr = 1, fonts, onFrameStats } = {}) {
	CK = await globalThis.CanvasKitInit({ locateFile: (f) => `/ck/${f}` });
	fontMgr = null;
	fontProvider = CK.TypefaceFontProvider.Make();
	for (const [family, url] of Object.entries(fonts)) {
		const data = await (await fetch(url)).arrayBuffer();
		fontProvider.registerFont(data, family);
	}
	canvasEl.width = width * dpr;
	canvasEl.height = height * dpr;
	canvasEl.style.width = `${width}px`;
	canvasEl.style.height = `${height}px`;
	const surface = CK.MakeWebGLCanvasSurface(canvasEl) ?? CK.MakeSWCanvasSurface(canvasEl);
	const container = { root: new Node("View", { style: { width, height } }) };
	const root = R.createContainer(container, ConcurrentRoot, null, false, null, "", console.error, console.error, console.error, () => {}, null);
	let dirty = true;
	let scheduled = false;
	const stats = { frames: 0, layoutMs: 0, paintMs: 0 };
	const draw = () => {
		scheduled = false;
		if (!dirty) return;
		dirty = false;
		const t0 = performance.now();
		container.root.yoga.calculateLayout(width, height, Direction.LTR);
		const t1 = performance.now();
		const canvas = surface.getCanvas();
		canvas.save();
		canvas.scale(dpr, dpr);
		canvas.clear(CK.WHITE);
		paintNode(canvas, container.root, 0, 0);
		canvas.restore();
		surface.flush();
		const t2 = performance.now();
		stats.frames++;
		stats.layoutMs += t1 - t0;
		stats.paintMs += t2 - t1;
		onFrameStats?.(stats);
	};
	requestFrame = (d) => {
		if (d) dirty = true;
		if (!scheduled) {
			scheduled = true;
			requestAnimationFrame(draw);
		}
	};
	// events: hit-test the painted boxes, deepest first
	const hit = (n, x, y, out) => {
		if (n instanceof RawText || !n.box) return;
		const b = n.box;
		// boxes are relative to parent; accumulate
		out.push(n);
	};
	const pick = (x, y) => {
		let found = [];
		const walk = (n, ox, oy) => {
			if (n instanceof RawText || !n.yoga) return;
			const L = n.yoga.getComputedLayout();
			const ax = ox + L.left,
				ay = oy + L.top;
			if (x >= ax && x <= ax + L.width && y >= ay && y <= ay + L.height) found.push(n);
			if (n.type !== "Text") for (const c of n.children) walk(c, ax, ay);
		};
		walk(container.root, 0, 0);
		return found;
	};
	let hovered = new Set();
	canvasEl.addEventListener("pointermove", (e) => {
		const r = canvasEl.getBoundingClientRect();
		const now = new Set(pick(e.clientX - r.left, e.clientY - r.top));
		for (const n of hovered) if (!now.has(n)) n.props.onHoverOut?.();
		for (const n of now) if (!hovered.has(n)) n.props.onHoverIn?.();
		hovered = now;
		const cur = [...now].reverse().find((n) => flat(n.props.style).cursor || n.props.onPress);
		canvasEl.style.cursor = cur ? (flat(cur.props.style).cursor ?? "pointer") : "default";
	});
	canvasEl.addEventListener("click", (e) => {
		const r = canvasEl.getBoundingClientRect();
		const stack = pick(e.clientX - r.left, e.clientY - r.top);
		for (let i = stack.length - 1; i >= 0; i--)
			if (stack[i].props.onPress) {
				stack[i].props.onPress();
				break;
			}
	});
	R.updateContainer(element, root, null, () => {});
	requestFrame(true);
	return { stats, redraw: () => requestFrame(true) };
}
