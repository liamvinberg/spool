import { useEffect, useRef } from "react";
import { SpoolMark } from "shared/ui/spool/mark";
import { createSpace, type Program, type Space, type Target } from "../gl";
import { CopyLine, DOWNLOAD, INSTALL, REPO } from "../install";
import { clamp, ease, glide, type Key, lerp, track, window4 } from "../math";
import { runReel, setLayer } from "../reel";
import pigmentSource from "./pigment.glsl";
import volumeSource from "./volume.glsl";
import "../space.css";
import { SpaceFooter } from "../footer";
import "./depth.css";

/* The film runs on u, from 0 to 6.5: a unit of scroll per scene, a screen tall each; the walk gets one and a half. */
const SCENES = 6.5;

type V3 = [number, number, number];
/** x, y, z, yaw, pitch, roll (degrees), half width, half height, visibility. */
type Pose = [number, number, number, number, number, number, number, number, number];

/* Six frames in the order the flow walks them. */
const SHEETS = ["home", "search", "listing", "cart", "checkout", "receipt"];

/* Later the same six sheets stand for versions of one frame, newest in front. */
const VERSIONS = [
	{ hash: "a41f2c9", message: "checkout: lead with the total" },
	{ hash: "7d03e18", message: "checkout: split into two steps" },
	{ hash: "3be6d70", message: "checkout: try Apple Pay first" },
	{ hash: "e90a4b1", message: "checkout: show the delivery date" },
	{ hash: "58c1f2d", message: "checkout: one column" },
	{ hash: "c2b95a4", message: "checkout: first pass" },
];
const WRITTEN = 4;

/* Where each sheet stands in each scene. Scenes: hero, write, canvas, flow, history, end. */
const HERO: Pose[] = [
	[-7.0, 2.6, -11, 26, -6, 3, 1.6, 1, 1],
	[7.6, -3.5, -0.5, -32, 8, -5, 0.55, 1.1, 1],
	[6.4, 3.0, -17, -20, 10, 4, 1.6, 1, 1],
	[-5.2, -3.6, -16, 18, -10, 7, 1.2, 1, 1],
	[2.6, 0.4, -7, -12, 0, 0, 1.6, 1, 0],
	[-12.5, 0.4, -27, 34, 4, -4, 0.55, 1.1, 1],
];
const WRITE: Pose[] = [
	[-7.6, 2.9, -12, 30, -6, 3, 1.6, 1, 1],
	[8.2, -3.9, -1.5, -36, 8, -5, 0.55, 1.1, 1],
	[7.0, 3.4, -18, -24, 10, 4, 1.6, 1, 1],
	[-6.0, -4.0, -17, 22, -10, 7, 1.2, 1, 1],
	[2.7, 0.45, -7, -16, 0, 0, 1.6, 1, 1],
	[-13.5, 0.4, -28, 38, 4, -4, 0.55, 1.1, 1],
];
const CANVAS: Pose[] = [
	[-6.75, 1.95, -12, 0, 0, 0, 1.3, 0.81, 1],
	[-4.1, 1.65, -12, 0, 0, 0, 0.45, 0.9, 1],
	[-1.45, 2.05, -12, 0, 0, 0, 1.3, 0.81, 1],
	[1.75, 1.55, -12, 0, 0, 0, 1.0, 0.81, 1],
	[4.95, 1.95, -12, 0, 0, 0, 1.3, 0.81, 1],
	[7.6, 1.65, -12, 0, 0, 0, 0.45, 0.9, 1],
];
/* A gallery: the frames stand either side of the path, turned in toward it. */
const FLOW: Pose[] = [
	[-2.9, 0.45, -7, 30, 0, 0, 1.6, 1, 1],
	[2.5, 0.2, -12.5, -32, 0, 0, 0.55, 1.1, 1],
	[-2.9, 0.5, -18, 30, 0, 0, 1.6, 1, 1],
	[2.7, 0.25, -23.5, -30, 0, 0, 1.2, 1, 1],
	[-2.9, 0.45, -29, 30, 0, 0, 1.6, 1, 1],
	[2.5, 0.2, -34.5, -32, 0, 0, 0.55, 1.1, 1],
];
/* Versions of one frame, newest in front, each older one a step up and back. */
const HISTORY: Pose[] = SHEETS.map((_, i) => [-1.2 + i * 0.12, 0.9 + i * 0.1, -44 - i * 1.15, 0, 0, 0, 1.6, 1, 1 - i * 0.08]);
const END: Pose[] = [
	[-11, 5.5, -54, 30, 0, 8, 1.6, 1, 0.7],
	[10, -5, -51, -30, 10, -6, 0.55, 1.1, 0.7],
	[12, 6.5, -60, -24, 0, 4, 1.6, 1, 0.6],
	[-9, -6.5, -58, 22, -10, 7, 1.2, 1, 0.6],
	[3, 9, -66, -10, 0, 0, 1.6, 1, 0.5],
	[-15, 1, -66, 34, 4, -4, 0.55, 1.1, 0.5],
];

/* When each pose is held, in u. The pose is reached at the first number and kept until the second. */
const STAGES: [Pose[], number, number][] = [
	[HERO, 0, 0.45],
	[WRITE, 1.2, 1.75],
	[CANVAS, 2.25, 3.4],
	[FLOW, 3.8, 4.8],
	[HISTORY, 5.22, 5.56],
	[END, 6.1, 6.5],
];

/** Camera keys: eye, target, focus distance, aperture. The walk overrides these while it runs. */
type Shot = [number, number, number, number, number, number, number, number];
const CAMERA: Key<Shot>[] = [
	{ at: 0, value: [0, 0, 8, 0, 0.3, -10, 17, 0.9] },
	{ at: 0.4, value: [0, 0, 7.6, 0, 0.3, -10, 17, 0.9] },
	{ at: 1.2, value: [-1.7, -0.25, 2.6, 0.9, 0.2, -7, 10.2, 1.35] },
	{ at: 1.75, value: [-1.5, -0.2, 2.1, 0.9, 0.2, -7, 9.7, 1.35] },
	{ at: 2.25, value: [0, -0.6, 6, 0, 0.6, -12, 18, 0.3] },
	{ at: 3.4, value: [0, -0.6, 5.0, 0, 0.6, -12, 17, 0.3] },
	{ at: 3.8, value: [0, 0.9, 4, 0, 0.5, -10, 11, 0.9] },
	{ at: 5.22, value: [-7.6, 0.5, -34.2, -2.6, 1.2, -47, 12.2, 0.7] },
	{ at: 5.56, value: [-7.0, 0.6, -35.0, -2.6, 1.2, -47, 11.5, 0.7] },
	{ at: 6.1, value: [0, 0.6, -47, 0, 0, -75, 18, 0.7] },
	{ at: 6.5, value: [0, 0.6, -50, 0, 0, -75, 18, 0.7] },
];

/* Under reduced motion the film cuts between these held shots, one per scene. */
const RESTS = [0.15, 1.6, 3.3, 3.84, 5.4, 6.4];

/* When each scene's copy arrives and leaves, in u. */
const CUES: [number, number, number, number][] = [
	[-Infinity, -Infinity, 0.42, 0.72],
	[0.9, 1.2, 1.75, 1.98],
	[2.02, 2.28, 2.8, 2.98],
	[3.0, 3.22, 4.75, 4.92],
	[4.98, 5.18, 5.56, 5.7],
	[5.75, 6.1, Infinity, Infinity],
];

/* Pigment hanging in the volume: centre and radius, and how dense each cloud is. */
const BLOBS: [number, number, number, number][] = [
	[5.5, -1.2, -19, 7],
	[-10, 4, -13, 6],
	[3, -2, -54, 9],
	[0, 0, -66, 15],
];
const BLOB_AMOUNT: [number, number, number, number] = [2.1, 0.5, 0.6, 1.3];

/* The thread is sampled into at most THREAD points, STEPS between each pair of knots. */
const THREAD = 64;
const STEPS = 6;

const rad = (deg: number) => (deg * Math.PI) / 180;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => scale(a, 1 / Math.max(1e-6, Math.hypot(a[0], a[1], a[2])));
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The axes of a sheet turned by yaw, pitch and roll. */
function axes(yaw: number, pitch: number, roll: number): [V3, V3] {
	const [cy, sy] = [Math.cos(rad(yaw)), Math.sin(rad(yaw))];
	const [cp, sp] = [Math.cos(rad(pitch)), Math.sin(rad(pitch))];
	const [cr, sr] = [Math.cos(rad(roll)), Math.sin(rad(roll))];
	const turn = (v: V3): V3 => {
		// roll about z, then pitch about x, then yaw about y
		const a: V3 = [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr, v[2]];
		const b: V3 = [a[0], a[1] * cp - a[2] * sp, a[1] * sp + a[2] * cp];
		return [b[0] * cy + b[2] * sy, b[1], -b[0] * sy + b[2] * cy];
	};
	return [turn([1, 0, 0]), turn([0, 1, 0])];
}

/** One sheet's pose at u, eased between the stages it holds, a little later the further down the flow it is. */
function poseAt(i: number, u: number): Pose {
	const delay = i * 0.035;
	const at = u - delay;
	const keys: Key<Pose>[] = [];
	for (const [poses, from, to] of STAGES) {
		const pose = poses[i];
		if (!pose) continue;
		keys.push({ at: from, value: pose });
		keys.push({ at: to, value: pose });
	}
	return track(keys, at) as Pose;
}

/** Catmull-Rom through the points, measured so the walk can move at an even pace. */
function spline(points: V3[], steps: number) {
	const out: V3[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)];
		if (!p0 || !p1 || !p2 || !p3) continue;
		for (let s = 0; s < steps; s++) {
			const t = s / steps;
			const t2 = t * t;
			const t3 = t2 * t;
			const at = (a: number, b: number, c: number, d: number) =>
				0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
			out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1]), at(p0[2], p1[2], p2[2], p3[2])]);
		}
	}
	const end = points[points.length - 1];
	if (end) out.push(end);
	const lengths = [0];
	for (let i = 1; i < out.length; i++) {
		const a = out[i - 1];
		const b = out[i];
		if (a && b) lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
	}
	return { points: out, lengths, total: lengths[lengths.length - 1] || 1 };
}

function along(path: ReturnType<typeof spline>, s: number): V3 {
	const goal = clamp(s) * path.total;
	const { lengths, points } = path;
	let i = 1;
	while (i < lengths.length - 1 && (lengths[i] ?? 0) < goal) i++;
	const a = points[i - 1] ?? [0, 0, 0];
	const b = points[i] ?? a;
	const la = lengths[i - 1] ?? 0;
	const lb = lengths[i] ?? la + 1;
	return mix3(a, b, lb > la ? (goal - la) / (lb - la) : 0);
}

/** Where along the path it first reaches depth z; the gallery path only ever moves away from the eye. */
function sAtZ(path: ReturnType<typeof spline>, z: number) {
	const { points, lengths, total } = path;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (!a || !b || b[2] > z) continue;
		const t = a[2] === b[2] ? 0 : clamp((a[2] - z) / (a[2] - b[2]));
		return lerp(lengths[i - 1] ?? 0, lengths[i] ?? 0, t) / total;
	}
	return 1;
}

export function DepthLanding() {
	const trackRef = useRef<HTMLElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scenes = useRef<(HTMLDivElement | null)[]>([]);
	const names = useRef<(HTMLSpanElement | null)[]>([]);
	const commits = useRef<(HTMLLIElement | null)[]>([]);
	const logRef = useRef<HTMLDivElement>(null);
	const pathRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const trackEl = trackRef.current;
		const canvas = canvasRef.current;
		if (!trackEl || !canvas) return;
		const stage = canvas.closest<HTMLElement>(".dp-stage");
		let space: Space | null = null;
		let volume: Program | null = null;
		let pigment: Program | null = null;
		let tile: Target | null = null;
		try {
			space = createSpace(canvas, { maxRatio: 1.5, maxPixels: 2_400_000 });
			if (space) {
				volume = space.program(volumeSource);
				pigment = space.program(pigmentSource);
				tile = space.target(512, 512, { repeat: true });
			}
		} catch (error) {
			console.warn("Depth volume unavailable:", error);
			space?.dispose();
			space = null;
		}
		if (stage) stage.dataset.backend = space ? space.backend : "fallback";

		let width = 1,
			height = 1,
			focal = 1;
		const quietBoxes: number[][] = [];
		const measure = (w: number, h: number) => {
			width = w;
			height = h;
			// Keep the horizontal view of a 16:10 screen on narrow ones, within reason.
			const halfX = Math.tan(rad(18)) * 1.6;
			const halfY = Math.min(Math.tan(rad(36)), Math.max(Math.tan(rad(18)), halfX / (w / h)));
			focal = h / 2 / halfY;
			space?.resize(w, h);
			quietBoxes.length = 0;
			for (const scene of scenes.current) {
				const copy = scene?.querySelector<HTMLElement>("[data-copy]");
				const box = copy ? [copy.offsetLeft, copy.offsetTop, copy.offsetWidth, copy.offsetHeight] : [0, -9999, 0, 0];
				// The history scene's quiet reaches up over the log as well.
				const log = logRef.current;
				if (scene === scenes.current[4] && log && copy) {
					const top = Math.min(log.offsetTop, copy.offsetTop);
					const bottom = copy.offsetTop + copy.offsetHeight;
					box[1] = top;
					box[2] = Math.max(copy.offsetWidth, log.offsetWidth);
					box[3] = bottom - top;
				}
				quietBoxes.push(box);
			}
		};

		const centers = new Float32Array(6 * 4);
		const rights = new Float32Array(6 * 4);
		const ups = new Float32Array(6 * 4);
		const marks = new Float32Array(6 * 4);
		const thread = new Float32Array(THREAD * 4);
		const blobs = new Float32Array(BLOBS.flat());

		const render = ({ progress, time, reduced, interval }: Parameters<Parameters<typeof runReel>[0]["render"]>[0]) => {
			const u = reduced ? (RESTS[Math.min(RESTS.length - 1, Math.floor(progress * RESTS.length))] ?? 0) : progress * SCENES;
			const drift = reduced ? 0 : lerp(1, 0.3, ease(u, 0.5, 2.2));

			// The sheets, where they stand now.
			const placed = SHEETS.map((_, i) => {
				const [x, y, z, yaw, pitch, roll, hw, hh, vis] = poseAt(i, u);
				const bob = Math.sin(time * 0.35 + i * 1.7) * 0.14 * drift;
				const sway = Math.sin(time * 0.22 + i * 2.3) * 2.2 * drift;
				const [right, up] = axes(yaw + sway, pitch + sway * 0.4, roll);
				const center: V3 = [x, y + bob, z];
				return { center, right, up, hw, hh, vis };
			});

			// The thread: through each centre in flow order, dipping between them.
			const knots: V3[] = [];
			placed.forEach((sheet, i) => {
				knots.push(sheet.center);
				const next = placed[i + 1];
				if (next) {
					const mid = scale(add(sheet.center, next.center), 0.5);
					// A thread hangs: it sags between the frames it links.
					knots.push(add(mid, [0, -0.75, 0.3]));
				}
			});
			const path = spline(knots, STEPS);
			const knotS = placed.map((_, i) => (path.lengths[i * 2 * STEPS] ?? 0) / path.total);
			const drawn = ease(u, 2.95, 3.38);
			const threadAlpha = ease(u, 2.9, 3.0) * (1 - ease(u, 4.82, 5.05));

			// The walk: a point runs the thread and the camera follows it down the gallery.
			const walk = glide(u, 3.84, 4.82);
			const follow = reduced ? 0 : ease(u, 3.7, 3.86) * (1 - ease(u, 4.8, 5.06));
			const walkZ = lerp(4, -27.5, walk);
			const beadS = sAtZ(path, walkZ - 8.5);
			const bead = along(path, beadS);
			const beadOn = window4(u, 3.72, 3.86, 4.8, 4.94);
			const [ex = 0, ey = 0, ez = 0, tx = 0, ty = 0, tz = 0, keyFocus = 10, aperture = 1] = track(CAMERA, u);
			let eye: V3 = [ex, ey, ez];
			let target: V3 = [tx, ty, tz];
			let focus = keyFocus;
			if (follow > 0) {
				const sway = Math.sin(walk * Math.PI * 3) * 0.35;
				const here: V3 = [sway, 0.95 + Math.sin(walk * Math.PI * 5) * 0.06, walkZ];
				const walkTarget: V3 = [lerp(sway, bead[0], 0.25), 0.35, walkZ - 10];
				eye = mix3(eye, here, follow);
				target = mix3(target, walkTarget, follow);
				focus = lerp(focus, Math.hypot(bead[0] - here[0], bead[1] - here[1], bead[2] - here[2]), follow);
			}
			const fwd = norm(sub(target, eye));
			const roll = follow * Math.sin(walk * Math.PI * 3) * rad(1.4);
			const flatRight = norm(cross(fwd, [0, 1, 0]));
			const flatUp = cross(flatRight, fwd);
			const right = add(scale(flatRight, Math.cos(roll)), scale(flatUp, Math.sin(roll)));
			const up = add(scale(flatUp, Math.cos(roll)), scale(flatRight, -Math.sin(roll)));

			const project = (p: V3) => {
				const d = sub(p, eye);
				const z = dot(d, fwd);
				return { x: width / 2 + (dot(d, right) * focal) / z, y: height / 2 - (dot(d, up) * focal) / z, z };
			};
			const blurAt = (z: number) => aperture * Math.abs(1 / focus - 1 / Math.max(z, 0.05)) * height;

			// Copy: rises into focus, then drifts up and away.
			let loudest = 0,
				quiet = 0;
			CUES.forEach(([a, b, c, d], i) => {
				const alpha = window4(u, a, b, c, d);
				const arriving = a === -Infinity ? 0 : 1 - ease(u, a, b);
				const leaving = d === Infinity ? 0 : ease(u, c, d);
				const y = reduced ? 0 : arriving * 26 - leaving * 20;
				setLayer(scenes.current[i], alpha, `translate3d(0, ${y.toFixed(2)}px, 0)`, reduced ? 0 : arriving * 8 + leaving * 5);
				if (alpha > quiet) {
					quiet = alpha;
					loudest = i;
				}
			});

			// Labels sit on the sheets in screen space, blurred by the same lens.
			const nameAlpha = window4(u, 2.25, 2.45, 4.75, 4.92);
			setLayer(logRef.current, window4(u, 5.14, 5.3, 5.56, 5.7));
			placed.forEach((sheet, i) => {
				const corner = project(add(add(sheet.center, scale(sheet.right, -sheet.hw)), scale(sheet.up, sheet.hh)));
				const place = (el: HTMLElement | null | undefined, p: { x: number; y: number; z: number }, alpha: number) => {
					if (!el) return;
					const visible = p.z > 0.4 ? alpha * clamp((p.z - 0.4) / 1.2) : 0;
					el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
					el.style.opacity = visible.toFixed(3);
					el.style.visibility = visible < 0.002 ? "hidden" : "visible";
					const blur = Math.min(8, Math.max(0, blurAt(p.z) * 0.25 - 1));
					el.style.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : "none";
				};
				place(names.current[i], corner, nameAlpha);
				const commit = commits.current[i];
				if (commit) {
					const a = ease(u, 5.16 + i * 0.03, 5.28 + i * 0.03);
					commit.style.opacity = a.toFixed(3);
					commit.style.transform = reduced ? "" : `translate3d(0, ${((1 - a) * 10).toFixed(2)}px, 0)`;
				}
				if (i === WRITTEN) place(pathRef.current, corner, window4(u, 1.0, 1.2, 1.75, 1.98));
			});

			if (!space || !volume || !pigment || !tile) return;
			const { gl } = space;
			if (space.sample(interval)) space.resize(width, height);
			const clock = space.backend === "software" ? 4 : time + 4;

			pigment.use();
			gl.uniform1f(pigment.uniform("u_time"), clock);
			space.draw(tile);

			placed.forEach((sheet, i) => {
				centers.set([...sheet.center, sheet.vis], i * 4);
				rights.set([...sheet.right, sheet.hw], i * 4);
				ups.set([...sheet.up, sheet.hh], i * 4);
				// Heat: the drawing thread reaching a sheet, then the walk passing through it.
				const s = knotS[i] ?? 0;
				const reached = Math.exp(-(((drawn - s) / 0.06) ** 2)) * threadAlpha;
				const passing = Math.exp(-(((beadS - s) / 0.05) ** 2)) * beadOn;
				const written = i === WRITTEN ? ease(u, 1.0, 1.62) : 1;
				const warmth = 0.5 * ease(u, 5.5, 6.1);
				marks.set([Math.max(reached * 0.7, passing), written, warmth, 0], i * 4);
			});
			const count = Math.min(THREAD, path.points.length);
			for (let j = 0; j < count; j++) {
				const p = path.points[j];
				if (p) thread.set([p[0], p[1], p[2], 0], j * 4);
			}

			volume.use();
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, tile.texture);
			gl.uniform1i(volume.uniform("u_pigment"), 0);
			gl.uniform2f(volume.uniform("u_size"), width, height);
			gl.uniform1f(volume.uniform("u_time"), clock);
			gl.uniform3f(volume.uniform("u_eye"), eye[0], eye[1], eye[2]);
			gl.uniform3f(volume.uniform("u_right"), right[0], right[1], right[2]);
			gl.uniform3f(volume.uniform("u_up"), up[0], up[1], up[2]);
			gl.uniform3f(volume.uniform("u_fwd"), fwd[0], fwd[1], fwd[2]);
			gl.uniform1f(volume.uniform("u_focal"), focal);
			gl.uniform1f(volume.uniform("u_focus"), focus);
			gl.uniform1f(volume.uniform("u_aperture"), aperture);
			gl.uniform4fv(volume.uniform("u_pc[0]"), centers);
			gl.uniform4fv(volume.uniform("u_pr[0]"), rights);
			gl.uniform4fv(volume.uniform("u_pu[0]"), ups);
			gl.uniform4fv(volume.uniform("u_pm[0]"), marks);
			gl.uniform4fv(volume.uniform("u_thread[0]"), thread);
			gl.uniform1f(volume.uniform("u_threadCount"), count);
			gl.uniform1f(volume.uniform("u_threadDrawn"), drawn * (count - 1));
			gl.uniform1f(volume.uniform("u_threadAlpha"), threadAlpha);
			gl.uniform4fv(volume.uniform("u_blob[0]"), blobs);
			gl.uniform4f(volume.uniform("u_blobAmt"), ...BLOB_AMOUNT);
			gl.uniform1f(volume.uniform("u_flood"), ease(u, 5.55, 6.3) * 0.8);
			gl.uniform4f(volume.uniform("u_bead"), bead[0], bead[1], bead[2], beadOn);
			const box = quietBoxes[loudest] ?? [0, -9999, 0, 0];
			gl.uniform4f(volume.uniform("u_quiet"), box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0);
			gl.uniform1f(volume.uniform("u_quietness"), 0.55 * quiet);
			space.draw(null);
		};

		const stop = runReel({
			track: trackEl,
			render,
			measure,
			ambient: () => space?.backend === "webgl",
		});
		return () => {
			stop();
			space?.dispose();
		};
	}, []);

	return (
		<div className="sp-page dp-page">
			<section ref={trackRef} className="dp-track" style={{ height: `${(SCENES + 1) * 100}vh` }}>
				<div className="dp-stage" data-backend="fallback">
					<header className="dp-head">
						<a className="sp-brand" href="https://spool.page/" aria-label="spool home">
							<SpoolMark className="sp-mark" />
							<span>spool</span>
						</a>
						<nav aria-label="Website">
							<a href={`${REPO}#readme`}>Docs</a>
							<a href={REPO}>GitHub</a>
							<a href={DOWNLOAD}>Download</a>
						</nav>
					</header>
					<canvas ref={canvasRef} className="dp-canvas" aria-hidden="true" />

					<div className="dp-labels" aria-hidden="true">
						{SHEETS.map((name, i) => (
							<span
								key={name}
								ref={(el) => {
									names.current[i] = el;
								}}
								className="dp-label"
							>
								{name}
							</span>
						))}
						<span ref={pathRef} className="dp-label dp-path">
							design/frames/checkout/frame.tsx
						</span>
					</div>

					<div
						ref={(el) => {
							scenes.current[0] = el;
						}}
						className="dp-scene dp-opening"
					>
						<div data-copy>
							<h1>A canvas for working things out.</h1>
							<p>Design websites, apps and presentations with your agent, on a canvas that runs on your Mac.</p>
						</div>
					</div>

					<div
						ref={(el) => {
							scenes.current[1] = el;
						}}
						className="dp-scene"
					>
						<h2 data-copy>Ask your agent for a screen. It writes the frame as a TSX file in your project.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[2] = el;
						}}
						className="dp-scene"
					>
						<h2 data-copy>spool shows every frame live, side by side on one canvas.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[3] = el;
						}}
						className="dp-scene"
					>
						<h2 data-copy>Link them into a flow, then walk through it like the real thing.</h2>
					</div>

					<div
						ref={(el) => {
							scenes.current[4] = el;
						}}
						className="dp-scene"
					>
						<h2 data-copy>Every frame is a file in your repo, so Git keeps each version you try.</h2>
					</div>

					<div ref={logRef} className="dp-log">
						<p>~/shop $ git log --oneline design/frames/checkout</p>
						<ul>
							{VERSIONS.map((version, i) => (
								<li
									key={version.hash}
									ref={(el) => {
										commits.current[i] = el;
									}}
								>
									<span>{version.hash}</span> {version.message}
								</li>
							))}
						</ul>
					</div>

					<div
						ref={(el) => {
							scenes.current[5] = el;
						}}
						className="dp-scene dp-ending"
						id="start"
					>
						<div data-copy>
							<h2>Try it on the next thing you're unsure about.</h2>
							<div className="dp-actions">
								<a className="sp-download" href={DOWNLOAD}>
									Download for Mac
								</a>
								<CopyLine className="sp-command" command={INSTALL} />
							</div>
							<p className="dp-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						</div>
					</div>
				</div>
			</section>
			<SpaceFooter />
		</div>
	);
}
