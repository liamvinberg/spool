import fragmentSource from "./fragment.glsl";
import type { ShaderFactory } from "./surface";
import vertexSource from "./vertex.glsl";

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
