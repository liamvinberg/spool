import { atan, cos, exp, sin, sRGBTransferEOTF, uniform, uv, vec2, vec3, vec4 } from "three/tsl";
import { Mesh, MeshBasicNodeMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry, Scene, Vector2, WebGPURenderer } from "three/webgpu";
import type { ShaderDraw } from "./surface";

export async function createTsl(canvas: HTMLCanvasElement, forceWebGL = false): Promise<ShaderDraw> {
	const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL });
	renderer.toneMapping = NoToneMapping;
	await renderer.init();
	const clock = uniform(0);
	const pointer = uniform(new Vector2(0.5, 0.5));
	const aspect = uniform(1);
	const p = uv().sub(0.5).mul(vec2(aspect, 1)).mul(2).sub(vec2(0.62, 0.02)).sub(pointer.sub(0.5).mul(0.24));
	const q = vec2(p.x.mul(0.88).sub(p.y.mul(0.475)), p.x.mul(0.475).add(p.y.mul(0.88))).mul(vec2(0.88, 1.18));
	const a = atan(q.y, q.x);
	const r = q.length();
	const ring = sin(a.mul(3).add(clock.mul(0.45))).mul(0.055).add(cos(a.mul(7).sub(clock.mul(0.22))).mul(0.022)).add(0.63);
	const d = r.sub(ring);
	const envelope = exp(d.mul(d).mul(-95));
	const strands = sin(d.mul(230).add(sin(a.mul(8).add(clock.mul(0.3))).mul(2))).mul(0.5).add(0.5).pow(9);
	const spectrum = cos(vec3(0.06, 0.28, 0.52).add(a.mul(0.16)).add(r.mul(0.4)).add(clock.mul(0.015)).mul(6.283185)).mul(0.5).add(0.5);
	const glint = sin(a.mul(2).sub(clock.mul(0.25))).mul(0.5).add(0.5).pow(12);
	const col = vec3(0.031, 0.035, 0.047)
		.add(spectrum.mul(envelope).mul(strands.mul(1.3).add(0.25)))
		.add(vec3(1, 0.91, 0.77).mul(envelope).mul(strands).mul(glint).mul(0.65))
		.add(spectrum.mul(exp(d.mul(d).mul(-12))).mul(0.055));
	const material = new MeshBasicNodeMaterial();
	material.fragmentNode = vec4(sRGBTransferEOTF(col), 1);
	const geometry = new PlaneGeometry(2, 2);
	const scene = new Scene();
	scene.add(new Mesh(geometry, material));
	const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
	let lastWidth = 0;
	let lastHeight = 0;
	return {
		backend: renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2",
		draw(seconds, x, y, width, height) {
			if (width !== lastWidth || height !== lastHeight) {
				renderer.setSize(width, height, false);
				lastWidth = width;
				lastHeight = height;
			}
			clock.value = seconds;
			pointer.value.set(x, y);
			aspect.value = width / height;
			renderer.render(scene, camera);
		},
		dispose() {
			geometry.dispose();
			material.dispose();
			renderer.dispose();
		},
	};
}
