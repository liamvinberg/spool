import { useEffect, useRef } from "react";
import material from "./material.glsl";
import output from "./output.glsl";
import dissolve from "./dissolve.glsl";

const sources = { dissolve };
export type Effect = keyof typeof sources;
export interface Playback {
	from: number;
	to: number;
	mode: "rest" | "play" | "scrub";
	progress: number;
	revision: number;
}
const centers: readonly (readonly [number, number])[] = [[.77,.40],[.69,.23],[.84,.67]];
const vertex = `attribute vec2 a_position; varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }`;

/** Shared transport only. The pigment shader owns the transition. */
export function MotionField({ effect, playback, onProgress, onComplete }: {
	effect: Effect;
	playback: Playback;
	onProgress: (progress: number) => void;
	onComplete: () => void;
}) {
	const ref=useRef<HTMLCanvasElement>(null);
	const playbackRef=useRef(playback);
	const callbacks=useRef({onProgress,onComplete});
	const applyRef=useRef<(() => void) | null>(null);
	useEffect(() => { callbacks.current={onProgress,onComplete}; },[onProgress,onComplete]);
	useEffect(() => { playbackRef.current=playback; applyRef.current?.(); },[playback]);
	useEffect(() => {
		const canvas=ref.current;
		if(!canvas) return;
		const gl=canvas.getContext("webgl",{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:"low-power",preserveDrawingBuffer:true});
		if(!gl) { canvas.dataset.backend="unavailable"; return; }
		const program=gl.createProgram(),buffer=gl.createBuffer();
		if(!program || !buffer) return;
		const shaders: WebGLShader[]=[];
		const dispose=() => { for(const shader of shaders) gl.deleteShader(shader); gl.deleteProgram(program); gl.deleteBuffer(buffer); };
		for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,material+sources[effect]+output]] as const) {
			const shader=gl.createShader(type);
			if(!shader) { dispose(); return; }
			shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
			if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
				console.error(effect,gl.getShaderInfoLog(shader)); canvas.dataset.backend="failed"; dispose(); return;
			}
			gl.attachShader(program,shader);
		}
		gl.bindAttribLocation(program,0,"a_position"); gl.linkProgram(program);
		if(!gl.getProgramParameter(program,gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(program)); dispose(); return; }
		gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
		gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
		const size=gl.getUniformLocation(program,"u_size"),time=gl.getUniformLocation(program,"u_time");
		const from=gl.getUniformLocation(program,"u_from"),to=gl.getUniformLocation(program,"u_to"),progress=gl.getUniformLocation(program,"u_progress");
		const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
		let width=1,height=1,elapsed=0,last=0,raf=0,position=0,finished=false;
		const draw=() => {
			const a=centers[playbackRef.current.from] ?? centers[0]!;
			const b=centers[playbackRef.current.to] ?? centers[1]!;
			gl.uniform2f(size,width,height); gl.uniform2f(from,a[0],a[1]); gl.uniform2f(to,b[0],b[1]);
			gl.uniform1f(time,playbackRef.current.mode==="scrub" ? 0 : elapsed);
			gl.uniform1f(progress,position); gl.drawArrays(gl.TRIANGLES,0,3);
			canvas.dataset.progress=position.toFixed(3);
		};
		const report=() => { callbacks.current.onProgress(position); };
		const tick=(now:number) => {
			raf=0;
			if(document.hidden || reduced.matches || playbackRef.current.mode==="scrub") return;
			const dt=last ? Math.min((now-last)/1000,.08) : 0; last=now; elapsed+=dt;
			if(playbackRef.current.mode==="play" && !finished) {
				position=Math.min(1,position+dt/1.65); report();
				if(position===1) { finished=true; callbacks.current.onComplete(); }
			}
			draw(); raf=window.requestAnimationFrame(tick);
		};
		const resume=() => {
			window.cancelAnimationFrame(raf); raf=0; last=0;
			if(reduced.matches && playbackRef.current.mode==="play") {
				position=1; finished=true; report(); callbacks.current.onComplete();
			}
			draw();
			if(!document.hidden && !reduced.matches && playbackRef.current.mode!=="scrub") raf=window.requestAnimationFrame(tick);
		};
		const apply=() => { position=playbackRef.current.progress; finished=false; report(); resume(); };
		const resize=() => {
			const box=canvas.getBoundingClientRect(); width=Math.max(1,box.width); height=Math.max(1,box.height);
			const scale=Math.min(window.devicePixelRatio,1,880/width);
			canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale));
			gl.viewport(0,0,canvas.width,canvas.height); draw();
		};
		const observer=new ResizeObserver(resize); observer.observe(canvas);
		reduced.addEventListener("change",resume); document.addEventListener("visibilitychange",resume);
		applyRef.current=apply; resize(); apply(); canvas.dataset.backend="webgl";
		return () => {
			applyRef.current=null; window.cancelAnimationFrame(raf); observer.disconnect();
			reduced.removeEventListener("change",resume); document.removeEventListener("visibilitychange",resume); dispose();
		};
	},[effect]);
	return <canvas ref={ref} className="shader-study-field" data-effect={effect} aria-hidden="true" />;
}
