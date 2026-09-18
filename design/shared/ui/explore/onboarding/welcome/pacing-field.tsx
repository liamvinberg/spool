import { useEffect, useRef } from "react";
import { sampleFlowEasing, type FlowEasing } from "./momentum-easing";
import fragment from "./pacing-field.glsl";
import { pacingProfiles, type PacingTake } from "./pacing-profiles";

const vertex = `attribute vec2 a_position; varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }`;

export function PacingField({ take, step, flowEasing }: { take: PacingTake; step: number; flowEasing?: FlowEasing }) {
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
		const profile=pacingProfiles[take];
		const initial=profile.poses[step] ?? profile.poses[0];
		const position: number[]=[...initial];
		let source=[...position],target=step,started=0,progress=1;
		const material=gl.getUniformLocation(program,"u_material");
		const camera=gl.getUniformLocation(program,"u_camera");
		gl.uniform1f(gl.getUniformLocation(program,"u_scene"),profile.scene ? 1 : 0);
		let width=1,height=1,elapsed=0,last=0,raf=0;
		let flowFrom=0,flowTo=0,flowVelocity=0,flowInitialVelocity=0;
		const draw=() => {
			gl.uniform2f(size,width,height);gl.uniform1f(time,elapsed);
			gl.uniform4f(shape,position[0]!,position[1]!,position[2]!,position[3]!);
			gl.uniform2f(bend,position[4]!,position[5]!);
			gl.uniform3f(material,position[6]!,position[7]!,profile.transport);
			gl.uniform3f(camera,position[0]!,position[1]!,position[6]!);
			gl.drawArrays(gl.TRIANGLES,0,3);
			canvas.dataset.step=String(target);canvas.dataset.progress=progress.toFixed(3);
		};
		const start=() => {
			if(wanted.current!==target) {
				source=[...position];target=wanted.current;started=performance.now();progress=0;
				flowFrom=elapsed;flowTo=elapsed+(profile.flowTravel ?? 0);flowInitialVelocity=flowVelocity;
			}
			if(reduced.matches) {
				const destination=profile.poses[target] ?? profile.poses[0];
				destination.forEach((value,index)=>{position[index]=value;});
				progress=1;
				if(profile.flowTravel) { elapsed=flowTo;flowVelocity=0; }
			}
		};
		const tick=(stamp:number) => {
			raf=0;
			if(document.hidden || reduced.matches) return;
			const dt=last ? Math.min((stamp-last)/1000,.06) : 0;last=stamp;
			progress=started ? Math.max(0,Math.min(1,(stamp-started)/profile.duration)) : 1;
			const destination=profile.poses[target] ?? profile.poses[0];
			const p=progress;
			if(profile.flowTravel) {
				// One continuous trip through the pigment, then an exact hold.
				// Preserve velocity if another click interrupts the trip.
				const seconds=profile.duration/1000,travel=flowTo-flowFrom;
				const tangent=flowInitialVelocity*seconds;
				if(flowEasing) {
					const sample=sampleFlowEasing(flowEasing,p);
					elapsed=p===1 ? flowTo : flowFrom+travel*sample.value;
					flowVelocity=p===1 ? 0 : travel*sample.slope/seconds;
				} else {
					elapsed=flowFrom+travel*(3*p*p-2*p*p*p)+tangent*(p*p*p-2*p*p+p);
					flowVelocity=(travel*(6*p-6*p*p)+tangent*(3*p*p-4*p+1))/seconds;
				}
			} else elapsed+=dt;
			// A shared duration with the copy. Echo leads with the pigment;
			// Current lets the words move first, then gently catches up.
			const phase=take==="echo" ? Math.min(1,p/ .72) : take==="pan" ? Math.max(0,(p-.12)/.88) : p;
			const eased=phase*phase*(3-2*phase);
			const pulse=Math.sin(Math.PI*phase)**2;
			destination.forEach((value,index)=>{
				position[index]=source[index]!+(value-source[index]!)*eased+profile.swell[index]!*pulse;
			});
			draw();
			if(!profile.flowTravel || progress<1) raf=window.requestAnimationFrame(tick);
		};
		const sync=() => {
			window.cancelAnimationFrame(raf);raf=0;last=0;start();draw();
			if(!document.hidden && !reduced.matches && (!profile.flowTravel || progress<1)) raf=window.requestAnimationFrame(tick);
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
	}, [take,flowEasing]);
	return <canvas ref={ref} data-pacing-take={take} data-flow-easing={flowEasing} aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",background:"#101010"}} />;
}
