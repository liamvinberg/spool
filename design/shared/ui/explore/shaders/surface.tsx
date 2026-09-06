import { useEffect, useRef, useState } from "react";

export interface ShaderDraw {
	draw(time: number, x: number, y: number, width: number, height: number): void;
	dispose(): void;
	backend: string;
}

export type ShaderFactory = (canvas: HTMLCanvasElement) => ShaderDraw | Promise<ShaderDraw>;

// The effect owns its GPU resources. No spool imports: this component can move into a site.
export function ShaderSurface({ create }: { create: ShaderFactory }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const host = canvas.parentElement;
		if (!host) return;
		let disposed = false;
		let renderer: ShaderDraw | undefined;
		let request = 0;
		let width = 1;
		let height = 1;
		let x = 0.5;
		let y = 0.5;
		let targetX = x;
		let targetY = y;
		let elapsed = 0;
		let previous = 0;
		let draws = 0;
		const motion = matchMedia("(prefers-reduced-motion: reduce)");
		const paused = () => motion.matches || host.dataset.shaderPaused === "true";
		const draw = () => {
			renderer?.draw(elapsed, x, y, width, height);
			canvas.dataset.draws = String(++draws);
			canvas.dataset.time = elapsed.toFixed(3);
			canvas.dataset.pointer = `${x.toFixed(3)},${y.toFixed(3)}`;
		};
		const tick = (now: number) => {
			if (disposed) return;
			if (!paused()) {
				elapsed += previous ? Math.min((now - previous) / 1000, 0.05) : 0;
				x += (targetX - x) * 0.065;
				y += (targetY - y) * 0.065;
				draw();
			}
			previous = now;
			request = requestAnimationFrame(tick);
		};
		const resize = () => {
			const box = host.getBoundingClientRect();
			width = Math.max(1, Math.round(box.width * Math.min(devicePixelRatio, 1.5)));
			height = Math.max(1, Math.round(box.height * Math.min(devicePixelRatio, 1.5)));
			canvas.width = width;
			canvas.height = height;
			draw();
		};
		const pointer = (event: PointerEvent) => {
			const box = host.getBoundingClientRect();
			targetX = (event.clientX - box.left) / box.width;
			targetY = 1 - (event.clientY - box.top) / box.height;
		};
		const observer = new ResizeObserver(resize);
		Promise.resolve().then(() => create(canvas)).then((next) => {
			if (disposed) { next.dispose(); return; }
			renderer = next;
			canvas.dataset.backend = next.backend;
			resize();
			observer.observe(host);
			host.addEventListener("pointermove", pointer);
			request = requestAnimationFrame(tick);
		}).catch((cause: unknown) => {
			console.error("Shader initialization failed", cause);
			if (!disposed) setError(String(cause));
		});
		return () => {
			disposed = true;
			cancelAnimationFrame(request);
			observer.disconnect();
			host.removeEventListener("pointermove", pointer);
			renderer?.dispose();
		};
	}, [create]);
	return <><canvas className="shader-surface" ref={canvasRef} aria-hidden="true" />{error && <p role="alert" className="absolute bottom-20 left-7 max-w-lg text-sm text-red-300">{error}</p>}</>;
}
