// React twin of `particles`: rAF canvas sim in an effect — the heavy end of what an
// agent might drop on the canvas. The freeze shim wraps rAF before this module runs.

import { useEffect, useRef } from "react";

const N = 120;

export default function Particles() {
	const cvRef = useRef<HTMLCanvasElement | null>(null);
	useEffect(() => {
		const cv = cvRef.current;
		const ctx = cv?.getContext("2d");
		if (!cv || !ctx) return;
		const fit = () => {
			cv.width = cv.clientWidth;
			cv.height = cv.clientHeight;
		};
		fit();
		window.addEventListener("resize", fit);
		const ps = Array.from({ length: N }, () => ({
			x: Math.random() * 390,
			y: Math.random() * 700,
			vx: (Math.random() - 0.5) * 1.6,
			vy: (Math.random() - 0.5) * 1.6,
		}));
		let raf = 0;
		const step = () => {
			ctx.fillStyle = "#14121f";
			ctx.fillRect(0, 0, cv.width, cv.height);
			ctx.fillStyle = "#8f7ae8";
			for (const p of ps) {
				p.x += p.vx;
				p.y += p.vy;
				if (p.x < 0 || p.x > cv.width) p.vx *= -1;
				if (p.y < 0 || p.y > cv.height) p.vy *= -1;
				ctx.beginPath();
				ctx.arc(p.x, p.y, 2.2, 0, 6.283);
				ctx.fill();
			}
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => {
			window.removeEventListener("resize", fit);
			cancelAnimationFrame(raf);
		};
	}, []);
	return (
		<div className="flex h-full flex-col bg-[#14121f] font-sans antialiased select-none">
			<div className="px-5 pt-5 pb-3 text-white">
				<div className="text-[17px] font-bold">particles</div>
				<div className="mt-[3px] text-[12.5px] text-[#9a97ab]">
					rAF canvas sim · <span id="count">{N}</span> points
				</div>
			</div>
			<canvas id="sim" ref={cvRef} className="w-full flex-1" />
		</div>
	);
}
