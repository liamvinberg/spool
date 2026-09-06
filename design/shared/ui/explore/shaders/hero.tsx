import { type ReactNode, useState } from "react";

// Prototype: can an ordinary frame carry an interactive, reusable shader hero?
export function ShaderHero({ children, engine }: { children: ReactNode; engine: string }) {
	const [paused, setPaused] = useState(false);
	return (
		<main className="relative isolate flex min-h-full flex-col overflow-hidden bg-[#08090c] text-[#f6f1e9]" data-shader-paused={paused}>
			<style>{`
				.shader-copy { font-size: clamp(68px, 8.7vw, 128px); line-height: .91; letter-spacing: -.065em; }
				.shader-surface { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; }
				@media (max-width: 600px) { .shader-copy { font-size: 72px; } }
			`}</style>
			{children}
			<header className="relative flex items-center justify-between px-7 py-8 md:px-14">
				<span className="text-2xl font-medium tracking-[-.07em]">Prism®</span>
				<span className="text-sm text-white/60">Independent by nature.</span>
			</header>
			<section className="pointer-events-none relative flex flex-1 flex-col justify-center px-7 py-20 md:px-14">
				<h1 className="shader-copy max-w-[720px] font-medium">Make room<br />for wonder.</h1>
				<p className="mt-8 max-w-[300px] text-base leading-relaxed text-white/65">A little light. A change of perspective.<br />Something you can feel.</p>
				<button type="button" className="pointer-events-auto mt-9 w-fit border-b border-white/50 pb-2 text-sm" onClick={() => setPaused(!paused)} aria-pressed={paused}>
					{paused ? "Let it move ↗" : "Hold this moment ↗"}
				</button>
			</section>
			<footer className="relative flex items-end justify-between gap-5 px-7 pb-8 text-xs text-white/45 md:px-14">
				<span>Move your pointer through the light.</span>
				<span className="font-mono" data-engine-label>{engine}</span>
			</footer>
		</main>
	);
}
