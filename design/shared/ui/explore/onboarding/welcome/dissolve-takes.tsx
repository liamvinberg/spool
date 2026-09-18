import { useEffect, useRef } from "react";
import fragment from "./dissolve-takes.glsl";

export type DissolveTake = "clear" | "bloom" | "overlap" | "recede";
const takes = {
	clear: { index: 0, duration: .52 },
	bloom: { index: 1, duration: .56 },
	overlap: { index: 2, duration: .48 },
	recede: { index: 3, duration: .58 },
};
const vertex = `attribute vec2 a_position; varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }`;

export function DissolveField({ take, step }: { take: DissolveTake; step: number }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const wanted = useRef(step);
	const notify = useRef<(() => void) | null>(null);
	useEffect(() => { wanted.current=step; notify.current?.(); }, [step]);
	useEffect(() => {
		const canvas=ref.current;
		if(!canvas) return;
		const gl=canvas.getContext("webgl",{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:"low-power"});
		if(!gl) return;
		const program=gl.createProgram(),buffer=gl.createBuffer();
		if(!program || !buffer) return;
		const shaders: WebGLShader[]=[];
		const dispose=() => { shaders.forEach(shader=>gl.deleteShader(shader));gl.deleteProgram(program);gl.deleteBuffer(buffer); };
		for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
			const shader=gl.createShader(type);
			if(!shader) { dispose();return; }
			shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);gl.attachShader(program,shader);
		}
		gl.bindAttribLocation(program,0,"a_position");gl.linkProgram(program);
		if(!gl.getProgramParameter(program,gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(program));dispose();return; }
		gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
		gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
		const size=gl.getUniformLocation(program,"u_size"),time=gl.getUniformLocation(program,"u_time");
		const from=gl.getUniformLocation(program,"u_from"),to=gl.getUniformLocation(program,"u_to");
		const phase=gl.getUniformLocation(program,"u_progress");
		gl.uniform1f(gl.getUniformLocation(program,"u_take"),takes[take].index);
		const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
		let width=1,height=1,elapsed=0,last=0,raf=0,progress=1,source=step,target=step;
		const draw=() => {
			gl.uniform2f(size,width,height);gl.uniform1f(time,elapsed);
			gl.uniform1f(from,source);gl.uniform1f(to,target);gl.uniform1f(phase,progress);
			gl.drawArrays(gl.TRIANGLES,0,3);
			canvas.dataset.progress=progress.toFixed(3);canvas.dataset.step=String(target);
		};
		const start=() => {
			if(reduced.matches) { source=wanted.current;target=wanted.current;progress=1; }
			else if(progress===1 && wanted.current!==target) { source=target;target=wanted.current;progress=0; }
		};
		const tick=(stamp:number) => {
			raf=0;
			if(document.hidden || reduced.matches) return;
			const dt=last ? Math.min((stamp-last)/1000,.06) : 0;last=stamp;elapsed+=dt;
			progress=Math.min(1,progress+dt/takes[take].duration);
			start();draw();raf=window.requestAnimationFrame(tick);
		};
		const sync=() => {
			window.cancelAnimationFrame(raf);raf=0;last=0;start();draw();
			if(!document.hidden && !reduced.matches) raf=window.requestAnimationFrame(tick);
		};
		const resize=() => {
			const box=canvas.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);
			const resolution=Math.min(window.devicePixelRatio,1,900/width);
			canvas.width=Math.max(1,Math.round(width*resolution));canvas.height=Math.max(1,Math.round(height*resolution));
			gl.viewport(0,0,canvas.width,canvas.height);draw();
		};
		const observer=new ResizeObserver(resize);observer.observe(canvas);
		reduced.addEventListener("change",sync);document.addEventListener("visibilitychange",sync);
		notify.current=sync;resize();sync();canvas.dataset.backend="webgl";
		return () => { notify.current=null;window.cancelAnimationFrame(raf);observer.disconnect();reduced.removeEventListener("change",sync);document.removeEventListener("visibilitychange",sync);dispose(); };
	}, [take]);
	return <canvas ref={ref} data-dissolve-take={take} aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",background:"#101010"}} />;
}
