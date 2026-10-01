/**
 * Paints the wall's relief from the page's own layout. Every element marked
 * with data-relief is drawn where the browser put it, so wrapping, breakpoints
 * and fonts all come from the real DOM. One opaque canvas, one channel each:
 *   red   how far the surface is raised (type, plates, the mark)
 *   green how much red pigment sits in it (stains, the inlaid thread)
 *   blue  how far it is carved in (engraved lines, the niche)
 * Channels add with "lighter", so a stroke drawn in pure green only ever
 * touches the pigment.
 */

export type Relief = "raise" | "carve" | "plate" | "niche" | "stain" | "inlay" | "mark";

type Ctx = CanvasRenderingContext2D;

/* Canvas filters blur in canvas pixels, under no transform; everything else here is css pixels. */
let unit = 1;
const blurOf = (px: number) => (px * unit > 0.05 ? `blur(${(px * unit).toFixed(2)}px)` : "none");

function channel(r: number, g: number, b: number) {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** Draw the same shape at a few blurs and weights; together they make a rounded bevel. */
function bevel(ctx: Ctx, draw: () => void, rgb: [number, number, number], passes: [number, number][]) {
	for (const [blur, weight] of passes) {
		ctx.filter = blurOf(blur);
		ctx.fillStyle = channel(rgb[0] * weight, rgb[1] * weight, rgb[2] * weight);
		ctx.strokeStyle = ctx.fillStyle;
		draw();
	}
	ctx.filter = "none";
}

function words(ctx: Ctx, el: HTMLElement, origin: DOMRect, rgb: [number, number, number], soft: number) {
	const style = getComputedStyle(el);
	const size = Number.parseFloat(style.fontSize) || 16;
	ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
	ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
	ctx.textBaseline = "alphabetic";
	const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
	const placed = spans.map((span) => {
		const text = span.textContent ?? "";
		const box = span.getBoundingClientRect();
		const metrics = ctx.measureText(text);
		const ascent = metrics.fontBoundingBoxAscent;
		const descent = metrics.fontBoundingBoxDescent;
		const x = box.left - origin.left;
		const y = box.top - origin.top + (box.height - (ascent + descent)) / 2 + ascent;
		return { text, x, y };
	});
	const draw = () => {
		for (const word of placed) ctx.fillText(word.text, word.x, word.y);
	};
	bevel(ctx, draw, rgb, [
		[size * 0.032 * soft, 0.34],
		[size * 0.011 * soft, 0.4],
		[0.45, 0.26],
	]);
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
	ctx.fill();
}

export type WallPaint = { canvas: HTMLCanvasElement; width: number; height: number; scale: number };

/** Paint the relief of everything inside `wall`, in the wall's own css pixels times `scale`. */
export function paintWall(wall: HTMLElement, budget = 5_200_000): WallPaint {
	const width = wall.offsetWidth;
	const height = wall.offsetHeight;
	const scale = Math.min(1, Math.sqrt(budget / Math.max(1, width * height)), 8192 / Math.max(1, height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));
	const ctx = canvas.getContext("2d", { alpha: false });
	if (!ctx) return { canvas, width, height, scale };
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.scale(scale, scale);
	unit = scale;
	ctx.globalCompositeOperation = "lighter";
	const origin = wall.getBoundingClientRect();

	const order: Relief[] = ["stain", "niche", "plate", "inlay", "mark", "raise", "carve"];
	for (const kind of order) {
		for (const el of Array.from(wall.querySelectorAll<HTMLElement>(`[data-relief="${kind}"]`))) {
			const box = el.getBoundingClientRect();
			const x = box.left - origin.left;
			const y = box.top - origin.top;
			const w = box.width;
			const h = box.height;
			// The thread has no box of its own; it is drawn between the plates it names.
			if (kind !== "inlay" && (w < 1 || h < 1)) continue;
			const depth = Number(el.dataset.depth ?? 1);
			switch (kind) {
				case "raise":
					words(ctx, el, origin, [depth, Number(el.dataset.ink ?? 0), 0], 1);
					break;
				case "carve":
					words(ctx, el, origin, [0, Number(el.dataset.ink ?? 0), depth], 0.5);
					break;
				case "plate": {
					const r = Math.min(w, h) * 0.04;
					bevel(ctx, () => rounded(ctx, x, y, w, h, r), [depth * 0.55, 0, 0], [
						[5, 0.5],
						[1.6, 0.35],
						[0.4, 0.15],
					]);
					break;
				}
				case "niche": {
					const r = Math.min(w, h) * 0.03;
					bevel(ctx, () => rounded(ctx, x, y, w, h, r), [0, 0, depth], [
						[18, 0.55],
						[5, 0.3],
						[1, 0.15],
					]);
					break;
				}
				case "stain": {
					const blur = Math.min(w, h) * 0.32;
					ctx.filter = blurOf(blur);
					ctx.fillStyle = channel(0, Math.min(1, depth), 0);
					ctx.beginPath();
					ctx.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.36, 0, 0, Math.PI * 2);
					ctx.fill();
					ctx.filter = "none";
					break;
				}
				case "inlay": {
					// The thread links the plates it names, in order, sagging between them.
					const ids = (el.dataset.links ?? "").split(" ").filter(Boolean);
					const points = ids
						.map((id) => wall.querySelector<HTMLElement>(`[data-plate="${id}"]`)?.getBoundingClientRect())
						.filter((b): b is DOMRect => !!b)
						.map((b) => [b.left - origin.left + b.width / 2, b.top - origin.top + b.height / 2] as const);
					const path = new Path2D();
					points.forEach(([px, py], i) => {
						if (i === 0) path.moveTo(px, py);
						const prev = points[i - 1];
						if (!prev) return;
						const sag = Math.max(26, Math.abs(px - prev[0]) * 0.22);
						path.bezierCurveTo(prev[0] + (px - prev[0]) * 0.3, prev[1] + sag, prev[0] + (px - prev[0]) * 0.7, py + sag, px, py);
					});
					ctx.lineCap = "round";
					ctx.lineJoin = "round";
					for (const [blur, weight, lineWidth] of [
						[2.2, 0.5, 5],
						[0.6, 0.5, 2.6],
					] as const) {
						ctx.filter = blurOf(blur);
						ctx.lineWidth = lineWidth;
						ctx.strokeStyle = channel(0, weight, weight * 0.55 * depth);
						ctx.stroke(path);
					}
					ctx.filter = "none";
					// Where the thread meets a plate it is stitched through: a small carved eyelet.
					for (const [px, py] of points) {
						bevel(ctx, () => {
							ctx.beginPath();
							ctx.arc(px, py, 5, 0, Math.PI * 2);
							ctx.fill();
						}, [0, 1, 0.6], [
							[2, 0.6],
							[0.5, 0.4],
						]);
					}
					break;
				}
				case "mark": {
					// The mark is drawn from the svg the page already renders in this box.
					const mark = el.querySelector("path")?.getAttribute("d");
					if (!mark) break;
					// The mark's viewBox is 250 182 524 660.
					const s = Math.min(w / 524, h / 660);
					const shape = new Path2D(mark);
					const draw = () => {
						ctx.save();
						ctx.translate(x + (w - 524 * s) / 2, y + (h - 660 * s) / 2);
						ctx.scale(s, s);
						ctx.translate(-250, -182);
						ctx.fill(shape, "evenodd");
						ctx.restore();
					};
					bevel(ctx, draw, [depth, 1, 0], [
						[w * 0.025, 0.45],
						[w * 0.008, 0.35],
						[0.5, 0.2],
					]);
					break;
				}
			}
		}
	}
	ctx.globalCompositeOperation = "source-over";
	return { canvas, width, height, scale };
}
