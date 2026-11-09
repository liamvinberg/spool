import { useEffect, useRef } from "react";
import { SPOOL_MARK_PATH } from "../../brand";
import { RibbonMark } from "../icons";

/**
 * spool's first open (spool#250), from the design canvas's `onboarding-small-ripple`.
 *
 * The light gathers into the mark along the mark's own contours. It comes in at the
 * window's corners as a wide faint band of lines, each line one distance out from the
 * mark, and the band closes in; the closer it comes the narrower, brighter and more
 * like the mark its lines get, and on the swell's peak it is all inside the mark. The
 * mark lets one ring go as it lands, keeps its red, and rises to the window's head with
 * a quiet halo.
 *
 * Every value is a function of one clock, `t` seconds since the window showed.
 */

/** Seconds from the window showing. */
export const T = {
	/** the light shows at the corners */
	enter: 0.3,
	/** all of it in the mark: the swell's peak */
	land: 4.5,
	/** the mark starts up to the head */
	lift: 4.95,
	liftFor: 1.5,
	/** Welcome's words */
	words: 6.05,
	/** everything still: the loop stops */
	still: 8.6,
} as const;

const W = 560;
const H = 480;
/** the mark while the light gathers, and where it rests over Welcome: centre x, y and height, px */
const MID = { x: W / 2, y: 226, h: 150 };
const HEAD = { x: W / 2, y: 104, h: 62 };
/** how far out the light starts, in its own field: just past the window's corners */
const REACH = 2.55;
/** the texture: SPAN mark heights square, N texels a side */
const SPAN = 4.4;
const N = 1024;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const outCubic = (x: number) => 1 - (1 - x) ** 3;

/** the swell's loudness at t, 0 to 1, read from its measured envelope (one value every 0.1 s) */
export function loudness(envelope: readonly number[], t: number) {
	if (t < 0) return 0;
	const i = t * 10;
	const a = envelope[Math.floor(i)] ?? 0;
	const b = envelope[Math.floor(i) + 1] ?? 0;
	return a + (b - a) * (i - Math.floor(i));
}

/** everything the picture is at t */
export function sceneAt(t: number, envelope: readonly number[]) {
	const u = clamp((t - T.enter) / (T.land - T.enter));
	const lifting = inOutCubic(clamp((t - T.lift) / T.liftFor));
	const out = clamp((t - T.land) / 1.7);
	const gone = t >= T.land ? clamp(1 - (t - T.land) / 0.22) : 1;
	return {
		// fast while it is far, slowing as it closes on the mark
		reach: REACH * (1 - u) ** 1.45,
		amount: clamp((t - T.enter) / 0.9) * (0.12 + 0.95 * loudness(envelope, t)) * gone,
		lit: clamp((t - T.land + 0.06) / 0.3),
		flash: t >= T.land ? Math.exp(-(t - T.land) / 0.45) : 0,
		// back out to the window's edge, where the light came from
		wave: outCubic(out) * 2.2,
		waveAmount: t >= T.land ? (1 - out) ** 1.6 : 0,
		halo: clamp((t - 5.6) / 1.2),
		mark: { x: mix(MID.x, HEAD.x, lifting), y: mix(MID.y, HEAD.y, lifting), h: mix(MID.h, HEAD.h, lifting) },
	};
}

/** 1D squared distance transform (Felzenszwalb and Huttenlocher), in place over `f` with stride */
function edt1(
	f: Float64Array,
	n: number,
	off: number,
	stride: number,
	d: Float64Array,
	v: Int32Array,
	z: Float64Array,
) {
	let k = 0;
	v[0] = 0;
	z[0] = -1e20;
	z[1] = 1e20;
	for (let q = 1; q < n; q++) {
		let s = 0;
		for (;;) {
			const r = v[k] ?? 0;
			s = ((f[off + q * stride] ?? 0) + q * q - ((f[off + r * stride] ?? 0) + r * r)) / (2 * q - 2 * r);
			if (s > (z[k] ?? 0)) break;
			k--;
		}
		k++;
		v[k] = q;
		z[k] = s;
		z[k + 1] = 1e20;
	}
	k = 0;
	for (let q = 0; q < n; q++) {
		while ((z[k + 1] ?? 0) < q) k++;
		const r = v[k] ?? 0;
		d[q] = (q - r) * (q - r) + (f[off + r * stride] ?? 0);
	}
	for (let q = 0; q < n; q++) f[off + q * stride] = d[q] ?? 0;
}

function distance(sources: (i: number) => boolean) {
	const f = new Float64Array(N * N);
	for (let i = 0; i < f.length; i++) f[i] = sources(i) ? 0 : 1e20;
	const d = new Float64Array(N);
	const v = new Int32Array(N);
	const z = new Float64Array(N + 1);
	for (let x = 0; x < N; x++) edt1(f, N, x, N, d, v, z);
	for (let y = 0; y < N; y++) edt1(f, N, y * N, 1, d, v, z);
	return f;
}

let cached: Float32Array | null | undefined;
/**
 * The mark's signed distance field, made once and kept: a second or so of work on a slow
 * machine, so the frame starts it as soon as it is on screen, before the window opens.
 */
export function prepareField() {
	if (cached === undefined) cached = markField();
	return cached;
}

/** the mark's signed distance in mark heights, the mark in the middle of a square SPAN mark heights wide */
function markField() {
	const canvas = document.createElement("canvas");
	canvas.width = N;
	canvas.height = N;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	const perHeight = N / SPAN;
	const scale = perHeight / 660;
	ctx.setTransform(scale, 0, 0, scale, N / 2 - 512 * scale, N / 2 - 512 * scale);
	ctx.fill(new Path2D(SPOOL_MARK_PATH), "evenodd");
	const alpha = ctx.getImageData(0, 0, N, N).data;
	const inMark = (i: number) => (alpha[i * 4 + 3] ?? 0) > 127;
	const out = distance(inMark);
	const into = distance((i) => !inMark(i));
	const field = new Float32Array(N * N);
	// half a texel nearer each way, so the edge sits on the shape's own edge
	for (let i = 0; i < field.length; i++) {
		const outside = Math.sqrt(out[i] ?? 0);
		const inside = Math.sqrt(into[i] ?? 0);
		field[i] = (outside > 0 ? outside - 0.5 : -(inside - 0.5)) / perHeight;
	}
	return field;
}

/** The light, drawn from the mark's distance field: WebGL 2, as the canvas's pictures are. */
const fragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
// the window, in px
uniform vec2 u_size;
// the mark: centre x, y from the window's top left, and its height, in px
uniform vec3 u_mark;
// where the light's front is, in mark heights out from the mark: the window's edge at first, 0 when it is all in
uniform float u_reach;
// how far the rings have drifted in, in ring spacings
uniform float u_phase;
// how much light there is, from the swell's measured loudness
uniform float u_amount;
// the mark holding its own red once the light is in it, and the flare as it lands
uniform float u_lit;
uniform float u_flash;
// the one ring the mark lets go as it lands: how far out it is, in mark heights, and how much of it is left
uniform float u_wave;
uniform float u_waveAmount;
// the quiet halo the mark keeps over Welcome
uniform float u_halo;
// the mark's signed distance in mark heights, negative inside, over a square SPAN mark heights wide
uniform sampler2D u_sdf;

const float SPAN = 4.4;
const vec3 BG = vec3(.0549);
const vec3 RED = vec3(.961, .224, .102);
const vec3 HOT = vec3(1., .76, .6);
const vec3 DEEP = vec3(.3, .045, .02);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float field(vec2 screen) {
 vec2 q = (screen - u_mark.xy) / (u_mark.z * SPAN) + .5;
 vec2 c = clamp(q, 0., 1.);
 return texture(u_sdf, c).r + length(q - c) * SPAN;
}

// far from the mark the light keeps the window's own shape: a squircle with the window's
// proportions, so its first lines lie along the window's edge and corners
float window_(vec2 screen) {
 vec2 q = abs(screen - u_mark.xy) / u_mark.z / vec2(.58, .5);
 return (pow(pow(q.x, 6.) + pow(q.y, 6.), 1. / 6.) - 1.);
}

// the larger of two fields, rounded where they meet so no contour has a corner
float smax(float a, float b, float k) {
 float h = max(k - abs(a - b), 0.) / k;
 return max(a, b) + h * h * k * .25;
}

// how near a contour of the mark's distance sits, as light: rings close together by the mark, wide apart far out
float rings(float d, float px, float phase, float width) {
 const float A = .2;
 const float K = .3;
 float u = log(1. + max(d, 0.) / A) / K + phase;
 float g = fract(u);
 float off = min(g, 1. - g) * K * (A + max(d, 0.));
 return exp(-pow(off / (px * width), 2.)) + .22 * exp(-off / (px * 9.));
}

void main() {
 vec2 screen = vec2(v_uv.x, 1. - v_uv.y) * u_size;
 float d = field(screen);
 float px = 1. / u_mark.z;
 // the light's own field: the window's shape far out, turning into the mark's as it nears it
 float f = smax(d, window_(screen), .6);
 float grain = hash(floor(screen));

 // the light is a band of contours closing in: wide and faint far out, narrow and bright by the mark,
 // and dark ahead of itself, where it has not reached yet
 float width = (.1 + .26 * u_reach) * (f < u_reach ? .4 : 1.);
 float band = exp(-pow((f - u_reach) / width, 2.)) * step(.0, d + 2. * px);
 float gathered = 1. - clamp(u_reach / 2.55, 0., 1.);
 // the same light in a smaller room burns brighter
 float a = u_amount * mix(.5, 1.35, gathered * gathered);
 float lines = rings(f, px, u_phase, 1.1);
 vec3 c = BG;
 c = mix(c, DEEP, clamp(band * a * .55, 0., 1.));
 // the last of it, hugging the mark, is a soft glow rather than lines, so it soaks in rather than outlines
 float drawn = mix(.3, 1., smoothstep(.04, .45, u_reach));
 c += RED * band * mix(.5, lines, drawn) * a * .62;
 c += HOT * band * mix(.4, lines, drawn) * a * gathered * gathered * .26;

 // the mark, once the light is in it; the flare blooms a little past its edge
 float body = smoothstep(.7 * px, -.7 * px, d);
 c = mix(c, RED, body * u_lit);
 c += HOT * body * u_flash * .55;
 c += RED * exp(-max(d, 0.) / .2) * (1. - body) * u_flash * .4;

 // the ring it lets go, thinning as it goes
 float wave = exp(-pow((f - u_wave) / (px * (1.3 + 3. * u_wave)), 2.)) + .3 * exp(-abs(f - u_wave) / (px * 14.));
 c += RED * wave * u_waveAmount * (1. - body) * .5;

 // the halo it keeps: a warm breath around it, very quiet
 float halo = exp(-max(d, 0.) / .28) * .1;
 c += RED * halo * u_halo * (1. - body);

 // dithered, so the long gradients never band
 c += (grain - .5) / 255. * 1.6;
 outColor = vec4(c, 1.);
}`;

const vertex = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

/**
 * The window's light, from `startedAt` (a performance.now() stamp). Calls `onWords` once
 * when Welcome should come in. Under reduced motion it draws the rest at once; without
 * WebGL 2 the mark is a plain red SVG and the words still come on time.
 */
export function Ripple({
	startedAt,
	clock,
	envelope,
	onWords,
}: {
	startedAt: number;
	/** seconds into the intro now: the sound's own clock while it plays, so the light lands on what is heard */
	clock: () => number;
	envelope: readonly number[];
	onWords: () => void;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const clockRef = useRef(clock);
	clockRef.current = clock;
	const wordsRef = useRef(onWords);
	wordsRef.current = onWords;

	useEffect(() => {
		const canvas = ref.current;
		const holder = canvas?.parentElement;
		if (!canvas || !holder) return;
		let said = false;
		const say = () => {
			if (said) return;
			said = true;
			wordsRef.current();
		};
		const gl = canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
		});
		const field = gl ? prepareField() : null;
		// reduced motion: the open's end state at once, the words with it
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
		const fallback = () => {
			holder.dataset.backend = "fallback";
			const wait = still ? 0 : T.words * 1000 - (performance.now() - startedAt);
			const late = window.setTimeout(say, Math.max(0, wait));
			return () => clearTimeout(late);
		};
		if (!gl || !field) return fallback();
		const program = gl.createProgram();
		const buffer = gl.createBuffer();
		const texture = gl.createTexture();
		const shaders: WebGLShader[] = [];
		if (!program || !buffer || !texture) return fallback();
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) return fallback();
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return fallback();
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a hook
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		// half floats filter smoothly in WebGL 2, so the contours stay clean lines at any size
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, N, N, 0, gl.RED, gl.FLOAT, field);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const u = (name: string) => gl.getUniformLocation(program, name);
		const loc = {
			size: u("u_size"),
			mark: u("u_mark"),
			reach: u("u_reach"),
			phase: u("u_phase"),
			amount: u("u_amount"),
			lit: u("u_lit"),
			flash: u("u_flash"),
			wave: u("u_wave"),
			waveAmount: u("u_waveAmount"),
			halo: u("u_halo"),
			sdf: u("u_sdf"),
		};
		gl.uniform1i(loc.sdf, 0);
		holder.dataset.backend = "webgl";
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = W * ratio;
		canvas.height = H * ratio;
		gl.viewport(0, 0, canvas.width, canvas.height);

		let phase = 0;
		let last = 0;
		let raf = 0;
		const tick = (now: number) => {
			const t = still ? T.still : clockRef.current();
			const s = sceneAt(t, envelope);
			// the lines flow in a little faster than the band closes, and only while the swell sounds
			const dt = Math.min(now - (last || now), 64) / 1000;
			last = now;
			if (t < T.land) phase += dt * (0.25 + 0.9 * loudness(envelope, t));
			gl.uniform2f(loc.size, W, H);
			gl.uniform3f(loc.mark, s.mark.x, s.mark.y, s.mark.h);
			gl.uniform1f(loc.reach, s.reach);
			gl.uniform1f(loc.phase, phase);
			gl.uniform1f(loc.amount, s.amount);
			gl.uniform1f(loc.lit, s.lit);
			gl.uniform1f(loc.flash, s.flash);
			gl.uniform1f(loc.wave, s.wave);
			gl.uniform1f(loc.waveAmount, s.waveAmount);
			gl.uniform1f(loc.halo, s.halo);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			if (t >= T.words) say();
			if (t < T.still) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			gl.deleteTexture(texture);
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
		};
	}, [startedAt, envelope]);

	return (
		<div className="absolute inset-0" aria-hidden="true">
			<canvas ref={ref} className="absolute inset-0 size-full [[data-backend=fallback]>&]:opacity-0" />
			<span
				className="absolute hidden [[data-backend=fallback]>&]:block"
				style={{ left: HEAD.x - (HEAD.h * 524) / 660 / 2, top: HEAD.y - HEAD.h / 2, height: HEAD.h }}
			>
				<RibbonMark className="h-full" />
			</span>
		</div>
	);
}
