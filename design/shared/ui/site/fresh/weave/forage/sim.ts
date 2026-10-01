import agentsFrag from "./gl/agents.frag.glsl";
import depositFrag from "./gl/deposit.frag.glsl";
import depositVert from "./gl/deposit.vert.glsl";
import diffuseFrag from "./gl/diffuse.frag.glsl";
import displayFrag from "./gl/display.frag.glsl";
import historyFrag from "./gl/history.frag.glsl";
import quadVert from "./gl/quad.vert.glsl";

/** What the walkers are drawn to and kept from this step, all in CSS pixels, y down. */
export type Scene = {
	/** Frames whose outlines are food: x, y, w, h and how strongly each one feeds. */
	rects: { x: number; y: number; w: number; h: number; on: number }[];
	path: [number, number][];
	pathOn: number;
	pointer: { x: number; y: number; on: number };
	/** Boxes the copy sits in: x, y, w, h. */
	quiet: [number, number, number, number][];
	/** Where the network is fed and kept, x, y, w, h; elsewhere it thins to dust. */
	focus: { x: number; y: number; w: number; h: number; on: number };
	/** The share of walkers laying trail. */
	awake: number;
	/** How the walkers behave, eased between scenes by the caller. */
	angle: number;
	reach: number;
	turn: number;
	step: number;
	decay: number;
	deposit: number;
	food: number;
	scatter: number;
	exposure: number;
	ghost: number;
	point: { x: number; y: number; on: number };
};

export type Sim = {
	resize(width: number, height: number): void;
	step(scene: Scene, steps: number): void;
	draw(scene: Scene, fade: number): void;
	dispose(): void;
};

type Target = { texture: WebGLTexture; buffer: WebGLFramebuffer };

/**
 * A Physarum field on the GPU: walkers in a float texture, a trail they lay
 * and follow, and a slow history of everywhere the trail has been. The trail
 * runs at a fraction of the CSS size; the walker count follows the trail's area.
 */
export function createSim(canvas: HTMLCanvasElement): Sim | null {
	const gl = canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		powerPreference: "high-performance",
		preserveDrawingBuffer: true,
	});
	if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

	const shaders: WebGLShader[] = [];
	const programs: WebGLProgram[] = [];
	const compile = (vertex: string, fragment: string) => {
		const program = gl.createProgram();
		if (!program) throw new Error("Forage program allocation failed");
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Forage shader allocation failed");
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(gl.getShaderInfoLog(shader) ?? "Forage shader compile failed");
			}
			gl.attachShader(program, shader);
		}
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program) ?? "Forage link failed");
		}
		programs.push(program);
		const cache = new Map<string, WebGLUniformLocation | null>();
		return {
			program,
			at(name: string) {
				if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
				return cache.get(name) ?? null;
			},
		};
	};

	let agents: ReturnType<typeof compile>;
	let deposit: ReturnType<typeof compile>;
	let diffuse: ReturnType<typeof compile>;
	let history: ReturnType<typeof compile>;
	let display: ReturnType<typeof compile>;
	try {
		agents = compile(quadVert, agentsFrag);
		deposit = compile(depositVert, depositFrag);
		diffuse = compile(quadVert, diffuseFrag);
		history = compile(quadVert, historyFrag);
		display = compile(quadVert, displayFrag);
	} catch (error) {
		for (const p of programs) gl.deleteProgram(p);
		for (const s of shaders) gl.deleteShader(s);
		console.warn("Forage field unavailable:", error);
		return null;
	}
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	const targets: Target[] = [];
	const makeTarget = (w: number, h: number, format: number, type: number, internal: number, data: ArrayBufferView | null, filter: number): Target => {
		const texture = gl.createTexture();
		const buffer = gl.createFramebuffer();
		if (!texture || !buffer) throw new Error("Forage target allocation failed");
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		const target = { texture, buffer };
		targets.push(target);
		return target;
	};
	const dropTargets = () => {
		for (const t of targets) {
			gl.deleteTexture(t.texture);
			gl.deleteFramebuffer(t.buffer);
		}
		targets.length = 0;
	};

	let cssW = 1,
		cssH = 1,
		scale = 0.5,
		tw = 1,
		th = 1,
		side = 1,
		frame = 0;
	let agentPair: [Target, Target] | null = null;
	let trailPair: [Target, Target] | null = null;
	let historyPair: [Target, Target] | null = null;

	const build = () => {
		dropTargets();
		tw = Math.max(64, Math.round(cssW * scale));
		th = Math.max(64, Math.round(cssH * scale));
		// About one walker for every four and a half trail pixels.
		side = Math.max(64, Math.min(512, Math.round(Math.sqrt((tw * th) / 4.5))));
		const seed = new Float32Array(side * side * 4);
		for (let i = 0; i < side * side; i++) {
			// Start as a loose disc right of centre, so the first second is the network finding its shape.
			const a = Math.random() * Math.PI * 2;
			const d = Math.sqrt(Math.random()) * Math.min(tw, th) * 0.42;
			seed[i * 4] = tw * 0.62 + Math.cos(a) * d * 1.3;
			seed[i * 4 + 1] = th * 0.55 + Math.sin(a) * d;
			seed[i * 4 + 2] = Math.random() * Math.PI * 2;
			seed[i * 4 + 3] = Math.random() * 100;
		}
		const agentTarget = () => makeTarget(side, side, gl.RGBA, gl.FLOAT, gl.RGBA32F, seed, gl.NEAREST);
		agentPair = [agentTarget(), agentTarget()];
		const fieldTarget = () => makeTarget(tw, th, gl.RGBA, gl.HALF_FLOAT, gl.RGBA16F, null, gl.LINEAR);
		trailPair = [fieldTarget(), fieldTarget()];
		historyPair = [fieldTarget(), fieldTarget()];
		for (const t of [...trailPair, ...historyPair]) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, t.buffer);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
	};

	const bindTexture = (unit: number, texture: WebGLTexture) => {
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
	};
	/* CSS px, y down, to trail px, y up. */
	const tx = (x: number) => x * scale;
	const ty = (y: number) => (cssH - y) * scale;

	return {
		resize(width, height) {
			if (Math.abs(width - cssW) < 1 && Math.abs(height - cssH) < 1 && agentPair) return;
			cssW = Math.max(1, width);
			cssH = Math.max(1, height);
			// Small screens keep more resolution so the veins stay fine.
			scale = cssW < 760 ? 1 : 0.72;
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			canvas.width = Math.round(cssW * dpr);
			canvas.height = Math.round(cssH * dpr);
			build();
		},
		step(scene, steps) {
			if (!agentPair || !trailPair || !historyPair) return;
			gl.bindVertexArray(vao);
			for (let s = 0; s < steps; s++) {
				frame++;
				// Spread, fade and feed: trail[0] into trail[1].
				gl.viewport(0, 0, tw, th);
				gl.disable(gl.BLEND);
				gl.useProgram(diffuse.program);
				gl.bindFramebuffer(gl.FRAMEBUFFER, trailPair[1].buffer);
				bindTexture(0, trailPair[0].texture);
				gl.uniform1i(diffuse.at("u_trail"), 0);
				gl.uniform2f(diffuse.at("u_res"), tw, th);
				gl.uniform1f(diffuse.at("u_decay"), scene.decay);
				gl.uniform1f(diffuse.at("u_food"), scene.food);
				const rects = new Float32Array(24);
				const rectOn = new Float32Array(6);
				scene.rects.slice(0, 6).forEach((r, i) => {
					rects.set([tx(r.x + r.w / 2), ty(r.y + r.h / 2), (r.w / 2) * scale, (r.h / 2) * scale], i * 4);
					rectOn[i] = r.on;
				});
				gl.uniform4fv(diffuse.at("u_rects[0]"), rects);
				gl.uniform1fv(diffuse.at("u_rectOn[0]"), rectOn);
				const path = new Float32Array(26);
				for (let i = 0; i < 13; i++) {
					const p = scene.path[Math.min(i, scene.path.length - 1)] ?? [0, 0];
					path[i * 2] = tx(p[0]);
					path[i * 2 + 1] = ty(p[1]);
				}
				gl.uniform2fv(diffuse.at("u_path[0]"), path);
				gl.uniform1f(diffuse.at("u_pathOn"), scene.path.length > 1 ? scene.pathOn : 0);
				gl.uniform3f(diffuse.at("u_pointer"), tx(scene.pointer.x), ty(scene.pointer.y), scene.pointer.on);
				const quiet = new Float32Array(8).fill(-1);
				scene.quiet.slice(0, 2).forEach(([x, y, w, h], i) => {
					quiet.set([tx(x), ty(y + h), tx(x + w), ty(y)], i * 4);
				});
				gl.uniform4fv(diffuse.at("u_quiet[0]"), quiet);
				gl.uniform1f(diffuse.at("u_quietOn"), 1);
				const f = scene.focus;
				gl.uniform4f(diffuse.at("u_focus"), tx(f.x + f.w / 2), ty(f.y + f.h / 2), (f.w / 2) * scale, (f.h / 2) * scale);
				gl.uniform1f(diffuse.at("u_focusOn"), f.on);
				gl.uniform1f(diffuse.at("u_reachPx"), 150 * scale);
				gl.drawArrays(gl.TRIANGLES, 0, 3);

				// Lay new trail on top: every walker adds a little where it stands.
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.ONE, gl.ONE);
				gl.useProgram(deposit.program);
				bindTexture(0, agentPair[0].texture);
				gl.uniform1i(deposit.at("u_agents"), 0);
				gl.uniform2f(deposit.at("u_res"), tw, th);
				gl.uniform1i(deposit.at("u_side"), side);
				gl.uniform1f(deposit.at("u_deposit"), scene.deposit);
				gl.uniform1f(deposit.at("u_awake"), scene.awake);
				gl.drawArrays(gl.POINTS, 0, side * side);
				gl.disable(gl.BLEND);
				trailPair = [trailPair[1], trailPair[0]];

				// The walkers smell the fresh trail and move.
				gl.viewport(0, 0, side, side);
				gl.useProgram(agents.program);
				gl.bindFramebuffer(gl.FRAMEBUFFER, agentPair[1].buffer);
				bindTexture(0, agentPair[0].texture);
				bindTexture(1, trailPair[0].texture);
				gl.uniform1i(agents.at("u_agents"), 0);
				gl.uniform1i(agents.at("u_trail"), 1);
				gl.uniform2f(agents.at("u_res"), tw, th);
				gl.uniform1f(agents.at("u_frame"), frame % 10000);
				gl.uniform1f(agents.at("u_angle"), scene.angle);
				gl.uniform1f(agents.at("u_reach"), scene.reach);
				gl.uniform1f(agents.at("u_turn"), scene.turn);
				gl.uniform1f(agents.at("u_step"), scene.step);
				gl.uniform1f(agents.at("u_scatter"), scene.scatter);
				gl.uniform4f(agents.at("u_focus"), tx(f.x + f.w / 2), ty(f.y + f.h / 2), (f.w / 2) * scale, (f.h / 2) * scale);
				gl.uniform1f(agents.at("u_focusOn"), f.on);
				gl.uniform1f(agents.at("u_reachPx"), 150 * scale);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				agentPair = [agentPair[1], agentPair[0]];
			}
			// The history keeps the brightest the trail has been, fading over a minute or so.
			gl.viewport(0, 0, tw, th);
			gl.useProgram(history.program);
			gl.bindFramebuffer(gl.FRAMEBUFFER, historyPair[1].buffer);
			bindTexture(0, trailPair[0].texture);
			bindTexture(1, historyPair[0].texture);
			gl.uniform1i(history.at("u_trail"), 0);
			gl.uniform1i(history.at("u_history"), 1);
			gl.uniform2f(history.at("u_res"), tw, th);
			gl.uniform1f(history.at("u_keep"), 0.9992);
			gl.uniform1f(history.at("u_gain"), scene.exposure * 0.5);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			historyPair = [historyPair[1], historyPair[0]];
		},
		draw(scene, fade) {
			if (!trailPair || !historyPair) return;
			const ratio = canvas.width / cssW;
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.disable(gl.BLEND);
			gl.useProgram(display.program);
			bindTexture(0, trailPair[0].texture);
			bindTexture(1, historyPair[0].texture);
			gl.uniform1i(display.at("u_trail"), 0);
			gl.uniform1i(display.at("u_history"), 1);
			gl.uniform2f(display.at("u_size"), canvas.width, canvas.height);
			gl.uniform1f(display.at("u_exposure"), scene.exposure);
			gl.uniform1f(display.at("u_ghost"), scene.ghost);
			gl.uniform1f(display.at("u_fade"), fade);
			gl.uniform4f(
				display.at("u_point"),
				scene.point.x * ratio,
				(cssH - scene.point.y) * ratio,
				4.5 * ratio,
				scene.point.on,
			);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() {
			dropTargets();
			gl.deleteVertexArray(vao);
			for (const p of programs) gl.deleteProgram(p);
			for (const s of shaders) gl.deleteShader(s);
		},
	};
}
