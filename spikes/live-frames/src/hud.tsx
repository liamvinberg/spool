// Measurement HUD + minimal canvas chrome. The HUD owns its own rAF-based fps
// meter and polls lifecycle stats twice a second — the point of the rig is that
// every number here is visible while you feel the canvas.

import { useEffect, useRef, useState } from "react";
import type { ThumbSource } from "./canvas";
import { POLICIES, type Policy, type Stats, type TickBucket } from "./lifecycle";

type Fps = { avg: number; p95: number; long: number };

function useFps(): React.RefObject<number[]> {
	const ring = useRef<number[]>([]);
	useEffect(() => {
		let raf = 0;
		let last = performance.now();
		const loop = (t: number) => {
			ring.current.push(t - last);
			if (ring.current.length > 240) ring.current.shift();
			last = t;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, []);
	return ring;
}

const bucket = (b: TickBucket) =>
	b.frames === 0 ? "—" : `${b.tps} tps / ${b.frames} (${(b.tps / b.frames).toFixed(0)} each)`;

export function Hud({
	policy,
	onPolicy,
	thumbSource,
	onThumbSource,
	pwAvailable,
	getStats,
	shots,
	busy,
	onCaptureAll,
	onRunTour,
	onRunFull,
	results,
	onCloseResults,
}: {
	policy: Policy;
	onPolicy: (p: Policy) => void;
	thumbSource: ThumbSource;
	onThumbSource: (s: ThumbSource) => void;
	pwAvailable: boolean;
	getStats: () => Stats;
	shots: Record<string, string>;
	busy: boolean;
	onCaptureAll: () => void;
	onRunTour: () => void;
	onRunFull: () => void;
	results: string | null;
	onCloseResults: () => void;
}) {
	const ring = useFps();
	const [snap, setSnap] = useState<{ stats: Stats; fps: Fps } | null>(null);

	useEffect(() => {
		const iv = setInterval(() => {
			const ds = ring.current;
			const recent = ds.slice(-60);
			const mean = recent.reduce((a, v) => a + v, 0) / Math.max(1, recent.length);
			const sorted = [...ds].sort((a, b) => a - b);
			const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
			setSnap({
				stats: getStats(),
				fps: {
					avg: Math.round(1000 / Math.max(0.01, mean)),
					p95: Math.round(p95 * 10) / 10,
					long: ds.filter((d) => d > 33.4).length,
				},
			});
		}, 500);
		return () => clearInterval(iv);
	}, [getStats, ring]);

	const shotCount = Object.keys(shots).length;
	const avgKB =
		shotCount === 0
			? 0
			: Math.round(Object.values(shots).reduce((a, s) => a + s.length * 0.75, 0) / shotCount / 1024);

	const s = snap?.stats;
	const row = "flex items-baseline justify-between gap-3";
	const label = "text-[10px] uppercase tracking-wide text-white/40";
	const val = "text-[11px] font-medium text-white/90 tabular-nums";

	return (
		<>
			<div className="pointer-events-auto absolute top-3 right-3 flex w-[300px] flex-col gap-2.5 rounded-xl bg-[#1c1a26]/95 p-3.5 text-white shadow-lg backdrop-blur">
				<div className="flex items-baseline justify-between">
					<div className="text-[12px] font-semibold">live frames rig</div>
					<div className="text-[20px] font-bold tabular-nums" style={{ color: (snap?.fps.avg ?? 60) > 50 ? "#7ee2a8" : (snap?.fps.avg ?? 60) > 30 ? "#f5c76f" : "#f57f6f" }}>
						{snap?.fps.avg ?? "–"} <span className="text-[10px] font-normal text-white/40">fps</span>
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<div className={row}>
						<span className={label}>frame p95 / long (4s)</span>
						<span className={val}>{snap?.fps.p95 ?? "–"} ms / {snap?.fps.long ?? "–"}</span>
					</div>
					<div className={row}>
						<span className={label}>live · warm · snap</span>
						<span className={val}>
							{s ? `${s.counts.live} · ${s.counts.warm} · ${s.counts.snapshot}` : "–"}
						</span>
					</div>
					<div className={row}>
						<span className={label}>ticks — visible live</span>
						<span className={val}>{s ? bucket(s.buckets.visLive) : "–"}</span>
					</div>
					<div className={row}>
						<span className={label}>ticks — offscreen live</span>
						<span className={val}>{s ? bucket(s.buckets.offLive) : "–"}</span>
					</div>
					<div className={row}>
						<span className={label}>ticks — warm (hidden)</span>
						<span className={val}>{s ? bucket(s.buckets.warm) : "–"}</span>
					</div>
					<div className={row}>
						<span className={label}>js heap (main world)</span>
						<span className={val}>{s?.heapMB != null ? `${s.heapMB} MB` : "n/a"}</span>
					</div>
					<div className={row}>
						<span className={label}>last hydrate storm</span>
						<span className={val}>{s?.hydrate ? `${s.hydrate.n} frames · ${s.hydrate.ms} ms` : "–"}</span>
					</div>
					<div className={row}>
						<span className={label}>self-captures held</span>
						<span className={val}>{shotCount} ({avgKB} KB avg{s?.captureLast ? ` · run ${s.captureLast.ms} ms` : ""})</span>
					</div>
				</div>

				<div className="mt-1 flex flex-col gap-1">
					<div className={label}>policy</div>
					<div className="grid grid-cols-2 gap-1">
						{POLICIES.map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => onPolicy(p)}
								className={`rounded-md px-2 py-1.5 text-left text-[11px] font-medium ${policy === p ? "bg-[#8b5cf6] text-white" : "bg-white/8 text-white/70 hover:bg-white/15"}`}
							>
								{p}
							</button>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<div className={label}>thumbnails</div>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => onThumbSource("self")}
							className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium ${thumbSource === "self" ? "bg-[#8b5cf6] text-white" : "bg-white/8 text-white/70 hover:bg-white/15"}`}
						>
							self-capture
						</button>
						<button
							type="button"
							onClick={() => onThumbSource("playwright")}
							disabled={!pwAvailable}
							className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium ${thumbSource === "playwright" ? "bg-[#8b5cf6] text-white" : "bg-white/8 text-white/70 hover:bg-white/15"} disabled:opacity-30`}
						>
							playwright{pwAvailable ? "" : " (run pnpm shots)"}
						</button>
					</div>
				</div>

				<div className="flex gap-1">
					<button
						type="button"
						onClick={onCaptureAll}
						className="flex-1 rounded-md bg-white/8 px-2 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/15"
					>
						capture all
					</button>
					<button
						type="button"
						onClick={onRunTour}
						disabled={busy}
						className="flex-1 rounded-md bg-white/8 px-2 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/15 disabled:opacity-40"
					>
						{busy ? "running…" : "tour"}
					</button>
					<button
						type="button"
						onClick={onRunFull}
						disabled={busy}
						className="flex-1 rounded-md bg-[#8b5cf6]/80 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-[#8b5cf6] disabled:opacity-40"
					>
						{busy ? "running…" : "bench all"}
					</button>
				</div>

				<div className="text-[10px] leading-relaxed text-white/35">
					drag · wheel pan · ⌘/pinch zoom · ⇧1 fit · dbl-click a frame to go hands-on · esc out.
					type in a <b>scratchpad</b>, pan away, come back — warm keeps it, snapshot eats it.
				</div>
			</div>

			{results && (
				<div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/40">
					<div className="flex max-h-[80%] w-[720px] max-w-[92%] flex-col gap-3 rounded-xl bg-[#1c1a26] p-5 text-white shadow-2xl">
						<div className="flex items-center justify-between">
							<div className="text-[13px] font-semibold">tour results</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => void navigator.clipboard.writeText(results)}
									className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium hover:bg-white/20"
								>
									copy markdown
								</button>
								<button
									type="button"
									onClick={onCloseResults}
									className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium hover:bg-white/20"
								>
									close
								</button>
							</div>
						</div>
						<pre className="overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed">{results}</pre>
					</div>
				</div>
			)}
		</>
	);
}

export function BottomBar({
	tool,
	onTool,
	zoomPct,
	onZoomIn,
	onZoomOut,
	onZoomFit,
}: {
	tool: "select" | "hand";
	onTool: (t: "select" | "hand") => void;
	zoomPct: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomFit: () => void;
}) {
	const btn = (active: boolean) =>
		`rounded-lg px-3 py-1.5 text-[12px] font-medium ${active ? "bg-[#8b5cf6] text-white" : "text-[#1a1523]/70 hover:bg-black/5"}`;
	return (
		<div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white p-1.5 shadow-lg">
			<button type="button" className={btn(tool === "select")} onClick={() => onTool("select")}>
				select <span className="opacity-40">v</span>
			</button>
			<button type="button" className={btn(tool === "hand")} onClick={() => onTool("hand")}>
				hand <span className="opacity-40">h</span>
			</button>
			<div className="mx-1 h-5 w-px bg-black/10" />
			<button type="button" className={btn(false)} onClick={onZoomOut}>
				−
			</button>
			<div className="w-12 text-center text-[12px] font-medium tabular-nums text-[#1a1523]/80">{zoomPct}%</div>
			<button type="button" className={btn(false)} onClick={onZoomIn}>
				+
			</button>
			<button type="button" className={btn(false)} onClick={onZoomFit}>
				fit <span className="opacity-40">⇧1</span>
			</button>
		</div>
	);
}
