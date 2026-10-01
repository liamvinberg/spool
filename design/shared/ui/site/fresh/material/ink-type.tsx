import { type ElementType, useEffect, useRef } from "react";
import { createLoop, createProgram, createResolutionBudget, createTriangle, FULLSCREEN_VERTEX, pixelRatio } from "./gl";
import fragment from "./ink.glsl";
import stirSource from "./stir.glsl";

/**
 * Display type whose letters hold live pigment. The words stay real text in
 * the DOM (selectable, read aloud, and visible in red if WebGL is missing);
 * a canvas over them draws the ink, masked by the same words rendered at the
 * same metrics. Moving the cursor over the letters stirs the water.
 */
export function InkType({
	as: Tag = "p",
	lines,
	className,
	origin = [0.18, 0.4],
	seed = 0,
	delay = 0,
}: {
	as?: ElementType;
	lines: string[];
	className?: string;
	/** where the first drop lands, as a fraction of the block from its top left */
	origin?: [number, number];
	seed?: number;
	/** seconds to wait after first being seen before the drop lands */
	delay?: number;
}) {
	const [originX, originY] = origin;
	const holder = useRef<HTMLElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const element = holder.current;
		const surface = canvas.current;
		if (!element || !surface) return;
		const ink = createInk(element, surface, { origin: [originX, originY], seed, delay });
		return () => ink?.dispose();
	}, [originX, originY, seed, delay]);

	return (
		<Tag ref={holder} className={className} data-ink="fallback">
			<canvas ref={canvas} className="m-ink-canvas" aria-hidden="true" />
			{lines.map((line) => (
				<span key={line} className="m-ink-line">
					{line}
				</span>
			))}
		</Tag>
	);
}

const PAD = 0.18; // of the font size, room for overhangs and the drop's edge
const STATE_SCALE = 1 / 6;

function createInk(
	element: HTMLElement,
	surface: HTMLCanvasElement,
	options: { origin: [number, number]; seed: number; delay: number },
) {
	const gl = surface.getContext("webgl2", {
		alpha: true,
		premultipliedAlpha: true,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "low-power",
		preserveDrawingBuffer: false,
	});
	if (!gl) return null;
	let disposed = false;
	const budget = createResolutionBudget();
	const triangle = createTriangle(gl);
	const ink = createProgram(gl, FULLSCREEN_VERTEX, fragment);
	const stirs = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
	const stir = stirs ? createProgram(gl, FULLSCREEN_VERTEX, stirSource) : null;

	const mask = gl.createTexture();
	const scratch = document.createElement("canvas");
	const states = [0, 1].map(() => ({ texture: gl.createTexture(), buffer: gl.createFramebuffer() }));
	let current = 0;
	let stateSize = [1, 1];

	let width = 1;
	let height = 1;
	let ratio = 1;
	let ready = false;
	let firstSeen: number | null = null;
	const pointer = { x: 0, y: 0, active: false, lastX: 0, lastY: 0, known: false };

	const allocateState = () => {
		if (!stir) return;
		stateSize = [Math.max(8, Math.round(width * STATE_SCALE)), Math.max(8, Math.round(height * STATE_SCALE))];
		for (const state of states) {
			gl.bindTexture(gl.TEXTURE_2D, state.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, stateSize[0], stateSize[1], 0, gl.RGBA, gl.HALF_FLOAT, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindFramebuffer(gl.FRAMEBUFFER, state.buffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state.texture, 0);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	};

	/** Renders the element's own lines, at their own metrics, into the mask. */
	const paintMask = () => {
		const box = surface.getBoundingClientRect();
		scratch.width = surface.width;
		scratch.height = surface.height;
		const context = scratch.getContext("2d");
		if (!context) return;
		const style = getComputedStyle(element);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		context.fontKerning = "normal";
		if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
		context.fillStyle = "#fff";
		context.textBaseline = "alphabetic";
		for (const line of element.querySelectorAll<HTMLElement>(".m-ink-line")) {
			const text = line.firstChild;
			if (!text) continue;
			const range = document.createRange();
			range.selectNodeContents(line);
			const rect = range.getBoundingClientRect();
			const metrics = context.measureText(line.textContent ?? "");
			const baseline = rect.top - box.top + metrics.fontBoundingBoxAscent;
			context.fillText(line.textContent ?? "", rect.left - box.left, baseline);
		}
		gl.bindTexture(gl.TEXTURE_2D, mask);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	};

	const measure = () => {
		if (disposed) return;
		const box = surface.getBoundingClientRect();
		width = Math.max(1, box.width);
		height = Math.max(1, box.height);
		// Small blocks can afford the screen's full density; large ones are capped.
		ratio = pixelRatio(width * height < 500_000 ? 2 : 1.6, budget.scale);
		surface.width = Math.max(1, Math.round(width * ratio));
		surface.height = Math.max(1, Math.round(height * ratio));
		allocateState();
		paintMask();
		ready = true;
		element.dataset.ink = "live";
		loop.poke();
	};

	const step = (seconds: number, interval: number) => {
		if (!ready || disposed) return;
		if (firstSeen === null && interval > 0) firstSeen = seconds;
		const reduced = loop.reduced;
		const since = firstSeen === null ? 0 : seconds - firstSeen - options.delay;
		const reveal = reduced ? 1 : Math.min(Math.max(since / 2.4, 0), 1);
		if (interval > 0 && budget.sample(interval)) measure();

		if (stir && !reduced) {
			const box = surface.getBoundingClientRect();
			const x = pointer.x - box.left;
			const y = box.height - (pointer.y - box.top);
			let force = [0, 0];
			if (pointer.active && pointer.known) {
				force = [x - pointer.lastX, y - pointer.lastY];
				if (Math.hypot(force[0], force[1]) > 160) force = [0, 0];
			}
			pointer.lastX = x;
			pointer.lastY = y;
			pointer.known = pointer.active;
			const dt = Math.min(Math.max(interval / (1000 / 60), 0), 3);
			const from = states[current];
			const to = states[1 - current];
			gl.useProgram(stir.program);
			gl.bindFramebuffer(gl.FRAMEBUFFER, to.buffer);
			gl.viewport(0, 0, stateSize[0], stateSize[1]);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, from.texture);
			gl.uniform1i(stir.uniform("u_state"), 0);
			gl.uniform2f(stir.uniform("u_size"), width, height);
			gl.uniform2f(stir.uniform("u_pointer"), x, y);
			gl.uniform2f(stir.uniform("u_force"), force[0], force[1]);
			gl.uniform1f(stir.uniform("u_radius"), Math.max(60, height * 0.16));
			gl.uniform1f(stir.uniform("u_dt"), dt);
			triangle.draw();
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			current = 1 - current;
		}

		gl.useProgram(ink.program);
		gl.viewport(0, 0, surface.width, surface.height);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, mask);
		gl.uniform1i(ink.uniform("u_mask"), 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, stir ? states[current].texture : null);
		gl.uniform1i(ink.uniform("u_state"), 1);
		gl.uniform2f(ink.uniform("u_size"), width, height);
		gl.uniform1f(ink.uniform("u_time"), reduced ? 4 : seconds + 4);
		gl.uniform1f(ink.uniform("u_reveal"), reveal);
		gl.uniform2f(ink.uniform("u_origin"), width * options.origin[0], height * (1 - options.origin[1]));
		gl.uniform1f(ink.uniform("u_seed"), options.seed);
		gl.uniform1f(ink.uniform("u_ratio"), ratio);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		triangle.draw();
	};

	const loop = createLoop(element, step);
	const onPointer = (event: PointerEvent) => {
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		pointer.active = event.pointerType === "mouse" || event.pointerType === "pen";
	};
	const onLeave = () => {
		pointer.active = false;
		pointer.known = false;
	};
	const resize = new ResizeObserver(() => measure());
	resize.observe(element);
	window.addEventListener("pointermove", onPointer, { passive: true });
	document.documentElement.addEventListener("pointerleave", onLeave);
	void document.fonts.ready.then(() => {
		const style = getComputedStyle(element);
		return document.fonts.load(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`).then(measure, measure);
	});
	element.style.setProperty("--m-ink-pad", `${PAD}em`);

	return {
		dispose() {
			disposed = true;
			loop.dispose();
			resize.disconnect();
			window.removeEventListener("pointermove", onPointer);
			document.documentElement.removeEventListener("pointerleave", onLeave);
			triangle.dispose();
			gl.deleteProgram(ink.program);
			if (stir) gl.deleteProgram(stir.program);
			gl.deleteTexture(mask);
			for (const state of states) {
				gl.deleteTexture(state.texture);
				gl.deleteFramebuffer(state.buffer);
			}
		},
	};
}
