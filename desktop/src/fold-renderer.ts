/** Executed only inside the local, sandboxed cover surface. No daemon or IPC access. */
export function mountFold(covered: boolean): void {
	const canvas = document.querySelector("canvas");
	const copy = document.querySelector("main");
	if (!canvas || !copy) throw new Error("Missing update cover");
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	const gl = canvas.getContext("webgl", {
		alpha: true,
		premultipliedAlpha: false,
		antialias: false,
		depth: false,
		powerPreference: "low-power",
	});
	let program: WebGLProgram | null = null;
	if (gl) {
		program = gl.createProgram();
		if (program) {
			const sources = [
				[
					gl.VERTEX_SHADER,
					"attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}",
				],
				[
					gl.FRAGMENT_SHADER,
					`precision highp float;
varying vec2 v_uv; uniform float u_cover; uniform float u_exit;
float line(float d,float w){return exp(-pow(d/w,2.));}
void main(){
vec2 st=vec2(v_uv.x,1.-v_uv.y);float c=u_cover;
float travel=mix(c,1.-c,u_exit);float tension=sin(travel*3.14159265);
float curve=sin(st.x*3.14159265+travel*.7)*.13*tension;
float d=st.y-(travel*1.45-.22+curve);
float alpha=mix(1.-smoothstep(-.006,.006,d),smoothstep(-.006,.006,d),u_exit);
float roll=exp(-abs(d+.035)*26.);float silk=.5+.5*cos((st.x-.35)*5.+st.y*2.);
vec3 color=vec3(.055)+vec3(.075,.041,.028)*roll+vec3(.018)*silk;
color=mix(color,vec3(.961,.224,.102),line(d+.006,.006)*.70);
color+=vec3(.030,.013,.007)*line(st.x-.77+.1*sin(st.y*2.),.045);
alpha=mix(alpha,0.,1.-smoothstep(0.,.008,c));alpha=mix(alpha,1.,smoothstep(.992,1.,c));
gl_FragColor=vec4(color,alpha);}`,
				],
			] as const;
			for (const [type, source] of sources) {
				const shader = gl.createShader(type);
				if (!shader) {
					program = null;
					break;
				}
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
					gl.deleteShader(shader);
					program = null;
					break;
				}
				gl.attachShader(program, shader);
				gl.deleteShader(shader);
			}
			if (program) {
				gl.linkProgram(program);
				if (!gl.getProgramParameter(program, gl.LINK_STATUS)) program = null;
			}
			if (program) {
				gl.useProgram(program);
				gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
				gl.bufferData(
					gl.ARRAY_BUFFER,
					new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
					gl.STATIC_DRAW,
				);
				const position = gl.getAttribLocation(program, "a_position");
				gl.enableVertexAttribArray(position);
				gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
			}
		}
	}
	let amount = covered ? 1 : 0;
	let exiting = false;
	const draw = () => {
		const opacity = Math.max(0, (amount - 0.84) / 0.16);
		copy.style.opacity = String(opacity);
		copy.style.transform = `translateY(calc(-50% + ${reduced.matches ? 0 : 8 * (1 - opacity)}px))`;
		if (!gl || !program || reduced.matches || gl.isContextLost()) {
			canvas.style.background = "#0e0e0e";
			canvas.style.opacity = String(amount);
			return;
		}
		canvas.style.background = "transparent";
		canvas.style.opacity = "1";
		gl.uniform1f(gl.getUniformLocation(program, "u_cover"), amount);
		gl.uniform1f(gl.getUniformLocation(program, "u_exit"), exiting ? 1 : 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	};
	const resize = () => {
		const scale = Math.min(1, 1000 / innerWidth);
		canvas.width = Math.max(1, Math.round(innerWidth * scale));
		canvas.height = Math.max(1, Math.round(innerHeight * scale));
		gl?.viewport(0, 0, canvas.width, canvas.height);
		draw();
	};
	addEventListener("resize", resize);
	canvas.addEventListener("webglcontextlost", (event) => {
		event.preventDefault();
		program = null;
		draw();
	});
	reduced.addEventListener("change", draw);
	resize();
	const animate = (out: boolean) =>
		new Promise<void>((resolve) => {
			exiting = out;
			const start = performance.now();
			const duration = reduced.matches ? (out ? 140 : 120) : out ? 1050 : 820;
			const tick = (now: number) => {
				const p = Math.min(1, (now - start) / duration);
				const eased = p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2;
				amount = out ? 1 - eased : eased;
				draw();
				if (p < 1) requestAnimationFrame(tick);
				else resolve();
			};
			requestAnimationFrame(tick);
		});
	Object.assign(window, { fold: { enter: () => animate(false), reveal: () => animate(true) } });
}
