import type { ShaderFactory } from "./surface";

// GLSL stays text inside TS today; importing .glsl needs a loader Spool does not have.
const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
void main() {
  vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 2.0;
  p -= vec2(0.62, 0.02) + (pointer - 0.5) * 0.24;
  vec2 q = mat2(0.88, 0.475, -0.475, 0.88) * p;
  q *= vec2(0.88, 1.18);
  float a = atan(q.y, q.x);
  float r = length(q);
  float ring = 0.63 + 0.055 * sin(a * 3.0 + time * 0.45) + 0.022 * cos(a * 7.0 - time * 0.22);
  float d = r - ring;
  float envelope = exp(-d * d * 95.0);
  float strands = pow(0.5 + 0.5 * sin(d * 230.0 + sin(a * 8.0 + time * 0.3) * 2.0), 9.0);
  vec3 spectrum = 0.5 + 0.5 * cos(6.283185 * (vec3(0.06, 0.28, 0.52) + a * 0.16 + r * 0.4 + time * 0.015));
  float glint = pow(0.5 + 0.5 * sin(a * 2.0 - time * 0.25), 12.0);
  vec3 col = vec3(0.031, 0.035, 0.047);
  col += spectrum * envelope * (0.25 + strands * 1.3);
  col += vec3(1.0, 0.91, 0.77) * envelope * strands * glint * 0.65;
  col += spectrum * exp(-d * d * 12.0) * 0.055;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const createGlsl: ShaderFactory = (canvas) => {
	const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
	if (!gl) throw new Error("This browser could not create a WebGL context.");
	const shader = (type: number, source: string) => {
		const result = gl.createShader(type);
		if (!result) throw new Error("Could not create shader.");
		gl.shaderSource(result, source);
		gl.compileShader(result);
		if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
			const error = gl.getShaderInfoLog(result);
			gl.deleteShader(result);
			throw new Error(error ?? "Shader did not compile.");
		}
		return result;
	};
	const vertex = shader(gl.VERTEX_SHADER, vertexSource);
	const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
	const program = gl.createProgram();
	if (!program) throw new Error("Could not create shader program.");
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader did not link.");
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const position = gl.getAttribLocation(program, "position");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	const resolution = gl.getUniformLocation(program, "resolution");
	const pointer = gl.getUniformLocation(program, "pointer");
	const time = gl.getUniformLocation(program, "time");
	return {
		backend: "webgl",
		draw(seconds, x, y, width, height) {
			gl.viewport(0, 0, width, height);
			gl.uniform2f(resolution, width, height);
			gl.uniform2f(pointer, x, y);
			gl.uniform1f(time, seconds);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() {
			gl.deleteBuffer(buffer);
			gl.deleteProgram(program);
			gl.deleteShader(vertex);
			gl.deleteShader(fragment);
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		},
	};
};
