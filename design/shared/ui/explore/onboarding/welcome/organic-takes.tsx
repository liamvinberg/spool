import { useEffect, useRef } from "react";
import fragment from "./organic-takes.glsl";

// Three continuous responses to step changes: drift, turn, and reshape.
export type OrganicTake = "drift" | "current" | "breathe";
type Pose = readonly [number, number, number, number, number, number];
const origin: Pose = [.79, .39, .40, .43, 0, 0];
const takes: Record<OrganicTake, readonly [Pose, Pose, Pose]> = {
	drift: [origin, [.82,.31,.40,.43,0,0], [.83,.48,.40,.43,0,0]],
	current: [origin, [.78,.25,.48,.34,-.24,.09], [.85,.56,.38,.54,.16,-.08]],
	breathe: [origin, [.82,.37,.32,.51,.04,.10], [.79,.43,.48,.36,-.07,-.08]],
};
const vertex = `attribute vec2 a_position; varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }`;

export function OrganicField({ take, step }: { take: OrganicTake; step: number }) {
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
		const shape=gl.getUniformLocation(program,"u_pose"),bend=gl.getUniformLocation(program,"u_bend");
		const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
		const initial=takes[take][step] ?? origin;
		const position: number[]=[...initial],velocity=initial.map(()=>0);
		let width=1,height=1,elapsed=0,last=0,raf=0;
		const draw=() => {
			gl.uniform2f(size,width,height);gl.uniform1f(time,elapsed);
			gl.uniform4f(shape,position[0]!,position[1]!,position[2]!,position[3]!);
			gl.uniform2f(bend,position[4]!,position[5]!);
			gl.drawArrays(gl.TRIANGLES,0,3);
			canvas.dataset.step=String(wanted.current);
		};
		const start=() => {
			if(reduced.matches) {
				const destination=takes[take][wanted.current] ?? origin;
				destination.forEach((value,index)=>{position[index]=value;velocity[index]=0;});
				canvas.dataset.settled="true";
			}
		};
		const tick=(stamp:number) => {
			raf=0;
			if(document.hidden || reduced.matches) return;
			const dt=last ? Math.min((stamp-last)/1000,.06) : 0;last=stamp;elapsed+=dt;
			const destination=takes[take][wanted.current] ?? origin;
			// Exact critically damped spring: retarget from the current shape and
			// velocity, including when Back is pressed halfway through a movement.
			const frequency=15,decay=Math.exp(-frequency*dt);
			let unsettled=0;
			destination.forEach((value,index)=>{
				const offset=position[index]!-value;
				const impulse=velocity[index]!+frequency*offset;
				position[index]=value+(offset+impulse*dt)*decay;
				velocity[index]=(velocity[index]!-frequency*impulse*dt)*decay;
				unsettled=Math.max(unsettled,Math.abs(position[index]!-value));
			});
			canvas.dataset.settled=String(unsettled<.001);
			draw();raf=window.requestAnimationFrame(tick);
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
	return <canvas ref={ref} data-organic-take={take} aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",background:"#101010"}} />;
}
