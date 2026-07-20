// The lifecycle manager: decides snapshot | warm | live per frame from camera
// visibility + policy, owns the postMessage plumbing (hydrate storm, tick reports,
// self-capture), and exposes the numbers the HUD and benchmark read.
//
// States:
//   live     — iframe mounted + visible (+ interactive when the frame is "entered")
//   warm     — iframe mounted, hidden under a thumbnail; in-frame state survives
//   snapshot — no iframe; thumbnail (or placeholder) only; in-frame state is gone
//
// Policies:
//   all-live          — everything live, no matter what (the stress test)
//   viewport-warm     — visible → live; offscreen → warm (memory for state)
//   viewport-snapshot — visible → live; offscreen → capture-then-unmount after grace
//   all-snapshot      — nothing mounted (the floor)

import { useCallback, useEffect, useRef, useState } from "react";
import { type SceneFrame, sceneFrames } from "./scene";

export type Policy = "all-live" | "viewport-warm" | "viewport-snapshot" | "all-snapshot";
export type FrameState = "live" | "warm" | "snapshot";
export type Camera = { x: number; y: number; k: number };
export type Bounds = { x: number; y: number; w: number; h: number };

export const POLICIES: Policy[] = ["all-live", "viewport-warm", "viewport-snapshot", "all-snapshot"];

const MARGIN_FRAC = 0.5; // extra viewport fractions kept live on each side
const K_MIN_LIVE = 0.15; // below this zoom nothing is interactable anyway
const GRACE_MS = 2000; // offscreen time before viewport-snapshot unmounts
const EXIT_CAPTURE_TIMEOUT = 600; // ms to wait for a goodbye self-capture
const SWEEP_MS = 300;

export type TickBucket = { frames: number; tps: number };

export type Stats = {
	counts: { live: number; warm: number; snapshot: number };
	buckets: { visLive: TickBucket; offLive: TickBucket; warm: TickBucket };
	hydrate: { n: number; ms: number } | null;
	heapMB: number | null;
	captureLast: { n: number; ms: number; failed: number; avgKB: number } | null;
};

type FrameMsg = {
	spool?: "loaded" | "ticks" | "shot";
	id?: string;
	ticks?: number;
	url?: string;
	error?: string;
	ms?: number;
};

const intersects = (a: Bounds, b: Bounds) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function heapMB(): number | null {
	const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
	return mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
}

export function useLifecycle(
	framesRef: React.RefObject<SceneFrame[]>,
	cameraRef: React.RefObject<Camera | null>,
	viewportRef: React.RefObject<HTMLDivElement | null>,
	policy: Policy,
	interactId: string | null,
	selectedRef: React.RefObject<Set<string>>,
) {
	const [states, setStates] = useState<Record<string, FrameState>>(() =>
		Object.fromEntries(sceneFrames.map((f) => [f.id, "live" as FrameState])),
	);
	const [shots, setShots] = useState<Record<string, string>>({});
	// frames that have booted since their current mount — the thumbnail stays up
	// as the loading cover until its frame appears here (kills the entry flash)
	const [ready, setReady] = useState<Set<string>>(new Set());

	const statesRef = useRef(states);
	statesRef.current = states;
	const policyRef = useRef(policy);
	const interactRef = useRef(interactId);
	interactRef.current = interactId;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const lastVisible = useRef(new Map<string, number>());
	const visSet = useRef(new Set<string>());
	const shotsMirror = useRef<Record<string, string>>({});
	const needsShot = useRef(new Set<string>());
	const prevCam = useRef<Camera | null>(null);
	const lastCamMove = useRef(0);
	const ticks = useRef(new Map<string, { tps: number; at: number }>());
	const exitPending = useRef(new Map<string, { t0: number; captured: boolean }>());
	const pendingLoads = useRef(new Set<string>());
	const stormT0 = useRef(0);
	const stormN = useRef(0);
	const hydrate = useRef<{ n: number; ms: number } | null>(null);
	const captureLast = useRef<Stats["captureLast"]>(null);
	const captureWaiters = useRef(new Map<string, (ok: boolean) => void>());

	const onIframe = useCallback((id: string, el: HTMLIFrameElement | null) => {
		if (el) {
			iframes.current.set(id, el);
		} else {
			iframes.current.delete(id);
			setReady((s) => {
				if (!s.has(id)) return s;
				const n = new Set(s);
				n.delete(id);
				return n;
			});
		}
	}, []);

	// Everything the frames say arrives here.
	useEffect(() => {
		const onMsg = (e: MessageEvent) => {
			const m = e.data as FrameMsg;
			if (!m || !m.spool || typeof m.id !== "string") return;
			if (m.spool === "loaded") {
				setReady((s) => (s.has(m.id as string) ? s : new Set(s).add(m.id as string)));
				if (pendingLoads.current.delete(m.id) && pendingLoads.current.size === 0 && stormT0.current) {
					hydrate.current = { n: stormN.current, ms: Math.round(performance.now() - stormT0.current) };
					stormT0.current = 0;
				}
			} else if (m.spool === "ticks" && typeof m.ticks === "number") {
				ticks.current.set(m.id, { tps: m.ticks, at: performance.now() });
			} else if (m.spool === "shot") {
				if (m.url) {
					shotsMirror.current[m.id] = m.url;
					setShots((s) => ({ ...s, [m.id as string]: m.url as string }));
				}
				const ep = exitPending.current.get(m.id);
				if (ep) ep.captured = true;
				const w = captureWaiters.current.get(m.id);
				if (w) {
					captureWaiters.current.delete(m.id);
					w(Boolean(m.url));
				}
			}
		};
		window.addEventListener("message", onMsg);
		return () => window.removeEventListener("message", onMsg);
	}, []);

	const requestCapture = useCallback((id: string): Promise<boolean> => {
		const el = iframes.current.get(id);
		if (!el?.contentWindow) return Promise.resolve(false);
		return new Promise((resolve) => {
			captureWaiters.current.set(id, resolve);
			el.contentWindow?.postMessage({ spool: "capture" }, "*");
			setTimeout(() => {
				if (captureWaiters.current.delete(id)) resolve(false);
			}, 3000);
		});
	}, []);

	// The decision function. Runs on camera/policy change and on a sweep interval.
	const compute = useCallback(() => {
		const cam = cameraRef.current;
		const vp = viewportRef.current;
		const frames = framesRef.current;
		if (!cam || !vp || !frames) return;
		const now = performance.now();
		const pol = policyRef.current;

		// capture-on-settle: while the camera is moving, goodbye shots are deferred —
		// rasterizing frames mid-fling burns the shared main thread for thumbs nobody sees
		const pc = prevCam.current;
		if (!pc || pc.x !== cam.x || pc.y !== cam.y || pc.k !== cam.k) {
			prevCam.current = { ...cam };
			lastCamMove.current = now;
		}
		const camSettled = now - lastCamMove.current > 400;

		const vw = vp.clientWidth;
		const vh = vp.clientHeight;
		const visRect: Bounds = {
			x: (-cam.x - vw * MARGIN_FRAC) / cam.k,
			y: (-cam.y - vh * MARGIN_FRAC) / cam.k,
			w: (vw * (1 + 2 * MARGIN_FRAC)) / cam.k,
			h: (vh * (1 + 2 * MARGIN_FRAC)) / cam.k,
		};

		const nextVis = new Set<string>();
		const next: Record<string, FrameState> = {};
		let changed = false;

		for (const f of frames) {
			const cur = statesRef.current[f.id] ?? "live";
			const onScreen = intersects(visRect, f);
			if (onScreen) nextVis.add(f.id);
			const usable = onScreen && cam.k >= K_MIN_LIVE;
			if (usable) {
				lastVisible.current.set(f.id, now);
				exitPending.current.delete(f.id);
			}

			let target: FrameState;
			if (interactRef.current === f.id) {
				target = "live";
			} else if (pol === "all-live") {
				target = "live";
				exitPending.current.delete(f.id);
			} else if (pol === "all-snapshot") {
				// capture on the way down: hold at warm until the goodbye shot lands
				const ep = exitPending.current.get(f.id);
				if (cur === "live" && ep === undefined) {
					exitPending.current.set(f.id, { t0: now, captured: false });
					void requestCapture(f.id);
					target = "warm";
				} else if (ep && !(ep.captured || now - ep.t0 >= EXIT_CAPTURE_TIMEOUT)) {
					target = "warm";
				} else {
					exitPending.current.delete(f.id);
					target = "snapshot";
				}
			} else if (usable) {
				target = "live";
			} else if (pol === "viewport-warm") {
				target = cur === "snapshot" ? "snapshot" : "warm";
			} else {
				// viewport-snapshot: warm through the grace window, try a goodbye
				// capture, then unmount.
				const seen = lastVisible.current.get(f.id) ?? 0;
				if (cur === "snapshot") {
					target = "snapshot";
				} else if (now - seen < GRACE_MS) {
					target = "warm";
				} else {
					const ep = exitPending.current.get(f.id);
					if (ep === undefined) {
						exitPending.current.set(f.id, { t0: now, captured: false });
						void requestCapture(f.id);
						target = "warm";
					} else if (ep.captured || now - ep.t0 >= EXIT_CAPTURE_TIMEOUT) {
						exitPending.current.delete(f.id);
						target = "snapshot";
					} else {
						target = "warm";
					}
				}
			}
			// first click pre-boots: a selected still mounts hidden, so the
			// double-click that usually follows reveals an already-running frame
			if (target === "snapshot" && selectedRef.current.has(f.id)) target = "warm";

			// leaving live: this frame's thumbnail is stale — refresh it once the
			// camera settles, while the (hidden) iframe is still mounted, so overview
			// zoom shows content instead of placeholders
			if (cur === "live" && target === "warm") needsShot.current.add(f.id);
			if (
				target === "warm" &&
				camSettled &&
				(needsShot.current.has(f.id) || shotsMirror.current[f.id] === undefined) &&
				!captureWaiters.current.has(f.id) &&
				!exitPending.current.has(f.id)
			) {
				needsShot.current.delete(f.id);
				void requestCapture(f.id);
			}
			if (target === "live") needsShot.current.delete(f.id);
			next[f.id] = target;
			if (target !== cur) changed = true;
		}

		visSet.current = nextVis;
		if (changed) setStates(next);
	}, [cameraRef, viewportRef, framesRef, selectedRef, requestCapture]);

	// Policy switches are hydrate storms: note t0, expect loads from every frame
	// that will newly mount.
	useEffect(() => {
		const prevPolicy = policyRef.current;
		policyRef.current = policy;
		if (policy !== prevPolicy) hydrate.current = null; // a row only shows a storm it caused
		if (policy !== prevPolicy && (policy === "all-live" || policy.startsWith("viewport"))) {
			pendingLoads.current = new Set(
				framesRef.current?.filter((f) => (statesRef.current[f.id] ?? "live") === "snapshot").map((f) => f.id) ?? [],
			);
			if (pendingLoads.current.size > 0) {
				stormT0.current = performance.now();
				stormN.current = pendingLoads.current.size;
				hydrate.current = null;
			}
		}
		compute();
	}, [policy, compute, framesRef]);

	// Boot is also a storm (everything mounts at once in the default all-live).
	useEffect(() => {
		pendingLoads.current = new Set(framesRef.current?.map((f) => f.id) ?? []);
		stormT0.current = performance.now();
		stormN.current = pendingLoads.current.size;
		const iv = setInterval(compute, SWEEP_MS);
		return () => clearInterval(iv);
	}, [compute, framesRef]);

	const recompute = compute;

	const captureAll = useCallback(async () => {
		const ids = [...iframes.current.keys()];
		const t0 = performance.now();
		const results = await Promise.all(ids.map((id) => requestCapture(id)));
		const done = results.filter(Boolean).length;
		captureLast.current = {
			n: done,
			ms: Math.round(performance.now() - t0),
			failed: ids.length - done,
			avgKB: 0, // filled by the HUD from shot sizes
		};
		return captureLast.current;
	}, [requestCapture]);

	const getStats = useCallback((): Stats => {
		const now = performance.now();
		const counts = { live: 0, warm: 0, snapshot: 0 };
		const buckets = {
			visLive: { frames: 0, tps: 0 },
			offLive: { frames: 0, tps: 0 },
			warm: { frames: 0, tps: 0 },
		};
		for (const f of framesRef.current ?? []) {
			const st = statesRef.current[f.id] ?? "live";
			counts[st]++;
			const t = ticks.current.get(f.id);
			const tps = t && now - t.at < 2500 ? t.tps : 0;
			if (st === "live") {
				const b = visSet.current.has(f.id) ? buckets.visLive : buckets.offLive;
				b.frames++;
				b.tps += tps;
			} else if (st === "warm") {
				buckets.warm.frames++;
				buckets.warm.tps += tps;
			}
		}
		return { counts, buckets, hydrate: hydrate.current, heapMB: heapMB(), captureLast: captureLast.current };
	}, [framesRef]);

	const loadedPending = useCallback(() => pendingLoads.current.size, []);

	return { states, shots, ready, onIframe, recompute, captureAll, getStats, loadedPending };
}
