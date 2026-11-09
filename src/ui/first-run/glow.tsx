import { useEffect, useRef } from "react";
import { cn } from "../cn";

/**
 * The light band at the head of the first run's steps (spool#250), from the design
 * canvas's `onboarding-grow`.
 *
 * Where the pigment pools, as fractions of the holder: its centre, its radii (rx of the
 * width, ry of the height), how much of it shows, how hot it runs, how fast it drifts,
 * and how long (ms) it takes to ease to a new aim.
 */
export interface Aim {
	x: number;
	y: number;
	rx: number;
	ry: number;
	amount: number;
	heat?: number;
	speed?: number;
	tau?: number;
}

/** spool's site bloom, its pool driven from outside so the steps can lean it toward what is selected. */
const fragment = `precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_time;
// the pool in the holder's pixels: centre x, y and radius x, y
uniform vec4 u_pool;
uniform float u_amount;
// how far the ink leans to the bright thread red
uniform float u_heat;

// spool's site bloom (shared/ui/site/chapters/bloom.glsl), its pool driven from outside
// so the first run can lift it, gather it behind the mark and lay it down again.
const vec3 BG = vec3(.0549);
const vec3 RED = vec3(.961, .224, .102);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float noise(vec2 p) {
 vec2 i = floor(p), f = fract(p);
 f = f*f*(3.-2.*f);
 return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+1.), f.x), f.y);
}
float fbm(vec2 p) {
 float n=0., a=.5;
 for(int i=0; i<4; i++) { n+=a*noise(p); p=rot(.53)*p*2.03+3.7; a*=.5; }
 return n;
}
float pigment(vec2 p, float t) {
 vec2 drift=vec2(fbm(p*2.3+vec2(t,0.)), fbm(p*2.3+vec2(4.2,-t)))-.5;
 return fbm(p*3.+drift*3.+vec2(t,t*.4));
}
void main() {
 vec2 screen=vec2(v_uv.x,1.-v_uv.y)*u_size;
 vec2 p=(screen-u_pool.xy)/max(max(u_pool.z,u_pool.w),1.)*1.35;
 float value=pigment(p,u_time*.048);
 float cloud=smoothstep(.255,.735,value);
 vec2 d=(screen-u_pool.xy)/max(u_pool.zw,vec2(1.));
 float pool=exp(-dot(d,d)*2.);
 float grain=hash(floor(screen));
 vec3 ink=mix(vec3(.28,.034,.017),RED,smoothstep(.28-u_heat*.12,.73-u_heat*.2,value));
 float opacity=clamp(cloud*pool*u_amount*(.67+grain*.44),0.,1.);
 gl_FragColor=vec4(mix(BG,ink,opacity),1.);
}`;

const vertex = `attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }`;

type Num = "x" | "y" | "rx" | "ry" | "amount" | "heat" | "speed";
const KEYS: Num[] = ["x", "y", "rx", "ry", "amount", "heat", "speed"];

/**
 * spool's bloom, filling its parent, easing toward whatever `aim` says. Every value
 * glides on its own exponential ease, so a new aim mid-flight bends the motion rather
 * than restarting it. Still under reduced motion; a plain gradient without WebGL.
 */
export function Glow({ aim, className }: { aim: Aim; className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const aimRef = useRef(aim);
	aimRef.current = aim;

	useEffect(() => {
		const canvas = canvasRef.current;
		const holder = canvas?.parentElement;
		if (!canvas || !holder) return;
		const gl = canvas.getContext("webgl", {
			alpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true,
		});
		if (!gl) {
			holder.dataset.backend = "fallback";
			return;
		}
		const program = gl.createProgram();
		const buffer = gl.createBuffer();
		const shaders: WebGLShader[] = [];
		if (!program || !buffer) return;
		for (const [type, source] of [
			[gl.VERTEX_SHADER, vertex],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) return;
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, "a_position");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			holder.dataset.backend = "fallback";
			return;
		}
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a hook
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		const u = (name: string) => gl.getUniformLocation(program, name);
		const loc = { size: u("u_size"), time: u("u_time"), pool: u("u_pool"), amount: u("u_amount"), heat: u("u_heat") };
		holder.dataset.backend = "webgl";
		const lost = (event: Event) => {
			event.preventDefault();
			holder.dataset.backend = "fallback";
		};
		canvas.addEventListener("webglcontextlost", lost);

		const first = aimRef.current;
		const now: Record<Num, number> = {
			x: first.x,
			y: first.y,
			rx: first.rx,
			ry: first.ry,
			amount: first.amount,
			heat: first.heat ?? 0,
			speed: first.speed ?? 1,
		};
		let width = 1;
		let height = 1;
		let time = 7;
		let last = 0;
		let raf = 0;
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

		const resize = () => {
			width = Math.max(1, holder.clientWidth);
			height = Math.max(1, holder.clientHeight);
			const ratio = Math.min(window.devicePixelRatio || 1, 1.25, 2000 / Math.max(width, height));
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
			gl.viewport(0, 0, canvas.width, canvas.height);
		};
		const draw = () => {
			gl.uniform2f(loc.size, width, height);
			gl.uniform1f(loc.time, time);
			gl.uniform4f(loc.pool, now.x * width, now.y * height, now.rx * width, now.ry * height);
			gl.uniform1f(loc.amount, now.amount);
			gl.uniform1f(loc.heat, now.heat);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		};
		const tick = (stamp: number) => {
			const dt = last === 0 ? 16 : Math.min(stamp - last, 64);
			last = stamp;
			const a = aimRef.current;
			const f = still ? 1 : 1 - Math.exp(-dt / (a.tau ?? 600));
			const goal: Record<Num, number> = {
				x: a.x,
				y: a.y,
				rx: a.rx,
				ry: a.ry,
				amount: a.amount,
				heat: a.heat ?? 0,
				speed: a.speed ?? 1,
			};
			for (const k of KEYS) now[k] += (goal[k] - now[k]) * f;
			if (!still) time += (dt / 1000) * now.speed;
			draw();
			raf = requestAnimationFrame(tick);
		};
		const observer = new ResizeObserver(() => {
			resize();
			draw();
		});
		observer.observe(holder);
		resize();
		draw();
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			canvas.removeEventListener("webglcontextlost", lost);
			observer.disconnect();
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			for (const shader of shaders) gl.deleteShader(shader);
		};
	}, []);

	return (
		<div
			aria-hidden="true"
			className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-surface-window", className)}
		>
			<canvas ref={canvasRef} className="block h-full w-full [[data-backend=fallback]>&]:opacity-0" />
		</div>
	);
}
