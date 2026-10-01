import { animate, type MotionValue, motion, useMotionValue, useMotionValueEvent } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AUTHOR, CopyCommand, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/words/get-spool";
import { SpoolMark } from "shared/ui/spool/mark";
import { createThread, type Point } from "./thread";
import "./sheet.css";

/* The one-screen landing. A headline, three notes, a way to get it. The period
 * of the headline is a pin and a thread hangs from it through each note to the
 * download, the way spool links frames into a flow. The notes can be picked up
 * and moved, and the thread follows them. Esc puts them back. */

const DRAW_AT = 900;
const DRAW_FOR = 2100;
/* cubic-bezier(0.45, 0, 0.25, 1): when the drawn share reaches f, how far through the time are we */
function timeAt(f: number) {
	const [x1, y1, x2, y2] = [0.45, 0, 0.25, 1];
	const b = (u: number, p1: number, p2: number) => 3 * u * (1 - u) ** 2 * p1 + 3 * u * u * (1 - u) * p2 + u ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (b(mid, y1, y2) < f) lo = mid;
		else hi = mid;
	}
	return b((lo + hi) / 2, x1, x2);
}

function Note({
	children,
	x,
	y,
	at,
	bounds,
	free,
	onMove,
	innerRef,
}: {
	children: ReactNode;
	x: MotionValue<number>;
	y: MotionValue<number>;
	at: number;
	bounds: RefObject<HTMLDivElement | null>;
	free: boolean;
	onMove: () => void;
	innerRef: RefObject<HTMLDivElement | null>;
}) {
	useMotionValueEvent(x, "change", onMove);
	useMotionValueEvent(y, "change", onMove);
	return (
		<motion.div
			ref={innerRef}
			className="wsh-note"
			style={{ x, y, "--at": `${at}ms` } as never}
			drag={free}
			dragMomentum={false}
			dragConstraints={bounds}
			dragElastic={0.08}
			onDoubleClick={() => {
				animate(x, 0, { type: "spring", stiffness: 240, damping: 30 });
				animate(y, 0, { type: "spring", stiffness: 240, damping: 30 });
			}}
		>
			<p>{children}</p>
		</motion.div>
	);
}

export default function Frame() {
	const sheet = useRef<HTMLDivElement>(null);
	const period = useRef<HTMLSpanElement>(null);
	const end = useRef<HTMLAnchorElement>(null);
	const stack = useRef<HTMLDivElement>(null);
	const one = useRef<HTMLDivElement>(null);
	const two = useRef<HTMLDivElement>(null);
	const three = useRef<HTMLDivElement>(null);
	const line = useRef<SVGPathElement>(null);
	const dots = useRef<SVGGElement>(null);
	const thread = useRef<ReturnType<typeof createThread> | null>(null);
	const [reach, setReach] = useState<number[] | null>(null);
	const [free, setFree] = useState(true);
	const [moved, setMoved] = useState(false);

	const x1 = useMotionValue(0);
	const y1 = useMotionValue(0);
	const x2 = useMotionValue(0);
	const y2 = useMotionValue(0);
	const x3 = useMotionValue(0);
	const y3 = useMotionValue(0);
	const offsets = [x1, y1, x2, y2, x3, y3];

	const onMove = () => {
		thread.current?.wake();
		setMoved(offsets.some((v) => Math.abs(v.get()) > 0.5));
	};

	useLayoutEffect(() => {
		const root = sheet.current;
		if (!root) return;
		const read = (): Point[] => {
			const box = root.getBoundingClientRect();
			const pins: Point[] = [];
			const dot = period.current;
			/* on a phone the headline wraps over the notes, so the thread starts at the first one */
			if (dot && window.matchMedia("(min-width: 900px)").matches) {
				const p = dot.getBoundingClientRect();
				/* the headline is still rising when the thread is first hung; hang it where the period will land */
				const lift = dot.parentElement ? new DOMMatrix(getComputedStyle(dot.parentElement).transform).m42 : 0;
				pins.push({ x: p.left - box.left + p.width * 0.5, y: p.top - box.top - lift + p.height * 0.76 });
			}
			for (const note of [one, two, three]) {
				const r = note.current?.getBoundingClientRect();
				if (r) pins.push({ x: r.left - box.left - 20, y: r.top - box.top + 11 });
			}
			const e = end.current?.getBoundingClientRect();
			if (e) pins.push({ x: e.left - box.left - 20, y: e.top - box.top + e.height / 2 });
			return pins;
		};
		const draw = (d: string, pins: Point[]) => {
			line.current?.setAttribute("d", d);
			const g = dots.current;
			if (!g) return;
			const skip = g.children.length - pins.length;
			pins.forEach((pin, i) => {
				const c = g.children[i + skip] as SVGCircleElement | undefined;
				if (!c) return;
				c.setAttribute("cx", pin.x.toFixed(2));
				c.setAttribute("cy", pin.y.toFixed(2));
			});
		};
		const t = createThread(read, draw);
		thread.current = t;
		let cancelled = false;
		/* Stand the notes under the period, so the thread drops from it rather than leaning. */
		const align = () => {
			const column = stack.current;
			const dot = period.current;
			if (!column || !dot) return;
			column.style.marginLeft = "";
			if (!window.matchMedia("(min-width: 900px)").matches) return;
			const c = column.getBoundingClientRect();
			const p = dot.getBoundingClientRect();
			const dx = p.left + p.width / 2 - (c.left - 20);
			column.style.marginLeft = `${Math.max(-240, Math.min(160, dx)).toFixed(1)}px`;
		};
		void document.fonts.ready.then(() => {
			if (cancelled) return;
			align();
			t.settle();
			const shares = t.reach();
			setReach([...Array(Math.max(0, 5 - shares.length)).fill(0), ...shares]);
			const path = line.current;
			const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			if (path && !still) {
				const length = path.getTotalLength();
				path.style.strokeDasharray = `${length}`;
				path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
					duration: DRAW_FOR,
					delay: DRAW_AT,
					easing: "cubic-bezier(0.45, 0, 0.25, 1)",
					fill: "backwards",
				}).onfinish = () => {
					path.style.strokeDasharray = "";
				};
			}
		});
		const resize = () => {
			align();
			t.wake();
		};
		window.addEventListener("resize", resize);
		return () => {
			cancelled = true;
			t.stop();
			window.removeEventListener("resize", resize);
		};
	}, []);

	useEffect(() => {
		const wide = window.matchMedia("(min-width: 900px) and (pointer: fine)");
		const sync = () => setFree(wide.matches);
		sync();
		wide.addEventListener("change", sync);
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			for (const v of offsets) animate(v, 0, { type: "spring", stiffness: 220, damping: 30 });
		};
		window.addEventListener("keydown", key);
		return () => {
			wide.removeEventListener("change", sync);
			window.removeEventListener("keydown", key);
		};
	}, []);

	const at = (i: number) => (reach ? Math.round(DRAW_AT + DRAW_FOR * timeAt(reach[i] ?? 1)) : 0);

	return (
		<div ref={sheet} className="wsh-sheet" data-ready={reach !== null}>
			<header className="wsh-head">
				<a className="wsh-name" href="#top" aria-label="spool">
					<SpoolMark className="wsh-mark" />
					<span>spool</span>
				</a>
				<a className="wsh-link" href={REPO}>
					GitHub
				</a>
			</header>

			<main className="wsh-main" id="top">
				<h1 className="wsh-title">
					<span className="wsh-line">
						<span>A canvas for</span>
					</span>
					<span className="wsh-line">
						<span>
							working things out
							<span ref={period} className="wsh-period">
								.
							</span>
						</span>
					</span>
				</h1>
				<div className="wsh-row">
					<p className="wsh-lede">Design websites, apps and presentations with your agent, and try them live.</p>
					<div ref={stack} className="wsh-stack">
					<Note innerRef={one} x={x1} y={y1} at={at(1)} bounds={sheet} free={free} onMove={onMove}>
						Your agent writes each screen as a TSX file in your project.
					</Note>
					<Note innerRef={two} x={x2} y={y2} at={at(2)} bounds={sheet} free={free} onMove={onMove}>
						spool lays them out live on one canvas. Link them into a flow and walk through it like the real
						thing.
					</Note>
					<Note innerRef={three} x={x3} y={y3} at={at(3)} bounds={sheet} free={free} onMove={onMove}>
						The files stay in your repo, and Git keeps every version.
					</Note>
					<div className="wsh-get" style={{ "--at": `${at(4)}ms` } as never}>
						<a ref={end} className="wsh-download" href={DOWNLOAD}>
							Download for Mac
						</a>
						<CopyCommand className="wsh-command" command={INSTALL} />
						<p className="wsh-fine">
							Free and MIT licensed.
							<br />
							Apple silicon, macOS 14 or later.
						</p>
					</div>
					</div>
				</div>
			</main>

			<footer className="wsh-foot">
				<p>
					Made by <a href={AUTHOR}>Liam</a>
				</p>
				<p className="wsh-hint" data-show={moved} aria-hidden={!moved}>
					esc puts them back
				</p>
			</footer>

			<svg className="wsh-thread" aria-hidden="true">
				<path ref={line} />
				<g ref={dots}>
					<circle r="0" />
					<circle r="3.5" style={{ "--at": `${at(1)}ms` } as never} />
					<circle r="3.5" style={{ "--at": `${at(2)}ms` } as never} />
					<circle r="3.5" style={{ "--at": `${at(3)}ms` } as never} />
					<circle r="3.5" style={{ "--at": `${at(4)}ms` } as never} />
				</g>
			</svg>
		</div>
	);
}
