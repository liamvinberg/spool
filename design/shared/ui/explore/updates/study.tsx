import { useEffect, useRef, useState } from "react";
import { SpoolCanvasScreen } from "shared/ui/spool/canvas-screen";
import { SpoolMark } from "shared/ui/spool/mark";
import { CoverField, type Take } from "./field";
import "./study.css";
const descriptions: Record<Take, { name: string; description: string }> = {
	quiet: { name: "Quiet", description: "A short fade. The red thread holds the space." },
	thread: { name: "Thread", description: "A bowed ribbon unfurls, then carries on past the canvas." },
	pigment: { name: "Pigment", description: "Red pigment gathers, then opens softly around your work." },
	weave: { name: "Weave", description: "Curved strands arrive in sequence and slip away together." },
	fold: { name: "Fold", description: "A soft sheet rolls down, catches, and releases." },
	aperture: { name: "Aperture", description: "The canvas closes to a point, then opens in one breath." },
	"pigment-orbit": { name: "Pigment · Orbit", description: "A living pigment ring. The centre stays quiet." },
	"pigment-tide": { name: "Pigment · Tide", description: "A low wash of red rises and falls beneath the words." },
	"pigment-drift": { name: "Pigment · Drift", description: "Pigment flows through a narrow band, then disperses." },
};
type Phase = "preview" | "idle" | "covering" | "waiting" | "revealing" | "done" | "failed";
export function UpdateStudy({ take }: { take: Take }) {
	const [phase, setPhase] = useState<Phase>("preview");
	const [notice, setNotice] = useState(true);
	const [wait, setWait] = useState(take.startsWith("pigment-") ? 10000 : 650);
	const [hold, setHold] = useState(false);
	const [slow, setSlow] = useState(false);
	const [failed, setFailed] = useState(false);
	const surface = useRef<HTMLDivElement>(null),
		play = useRef<HTMLButtonElement>(null);
	const exiting = useRef(false);
	const amount = useRef(1),
		clock = useRef(0),
		release = useRef(false),
		mounted = useRef(true),
		run = useRef(0);
	const active = phase === "covering" || phase === "waiting" || phase === "revealing";
	const covered = active || phase === "preview" || phase === "failed";
	const spec = descriptions[take];
	const paint = (value: number) => {
		amount.current = value;
		surface.current?.style.setProperty("--cover", String(value));
		surface.current?.style.setProperty("--copy", String(Math.max(0, (value - 0.84) / 0.16)));
	};
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			run.current++;
			window.cancelAnimationFrame(clock.current);
		};
	}, []);
	const reset = () => {
		run.current++;
		window.cancelAnimationFrame(clock.current);
		paint(0);
		setPhase("idle");
		setNotice(true);
		setSlow(false);
		setFailed(false);
	};
	const start = () => {
		const id = ++run.current;
		window.cancelAnimationFrame(clock.current);
		release.current = false;
		exiting.current = false;
		setSlow(false);
		setFailed(false);
		setNotice(false);
		setPhase("covering");
		paint(0);
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const duration = reduced ? 120 : take === "quiet" ? 340 : take === "weave" ? 1000 : 820;
		const releaseDuration = reduced ? 140 : take === "quiet" ? 440 : 1050;
		const ease = (p: number) => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2);
		let begun: number | undefined, readyAt: number | undefined, revealAt: number | undefined;
		const tick = (now: number) => {
			if (!mounted.current || id !== run.current) return;
			begun ??= now;
			const elapsed = now - begun;
			if (elapsed < 160) {
				paint(0);
			} else if (elapsed < 160 + duration) {
				const p = (elapsed - 160) / duration;
				paint(ease(p));
			} else {
				readyAt ??= now;
				const waited = now - readyAt;
				if (revealAt === undefined) {
					setPhase("waiting");
					paint(1);
					if (waited > 6000) setSlow(true);
					if ((!hold && waited >= wait) || release.current) revealAt = now;
				}
				if (revealAt !== undefined) {
					setPhase("revealing");
					exiting.current = true;
					const p = Math.min(1, (now - revealAt) / releaseDuration);
					paint(1 - ease(p));
					if (p === 1) {
						setPhase("done");
						play.current?.focus();
						return;
					}
				}
			}
			clock.current = window.requestAnimationFrame(tick);
		};
		clock.current = window.requestAnimationFrame(tick);
	};
	const fail = () => {
		run.current++;
		window.cancelAnimationFrame(clock.current);
		paint(1);
		setFailed(true);
		setPhase("failed");
	};
	return (
		<main className="update-study">
			<div
				ref={surface}
				className="update-stage"
				data-phase={phase}
				data-take={take}
				style={{ "--cover": 1, "--copy": 1 } as React.CSSProperties}
			>
				<div className="update-workspace" inert={covered}>
					<SpoolCanvasScreen variant="rest" />
					{notice && (
						<div className="update-notice" role="status">
							<span>spool is ready to update.</span>
							<button type="button" onClick={start}>
								Update now
							</button>
							<button type="button" aria-label="Dismiss update notice" onClick={() => setNotice(false)}>
								×
							</button>
						</div>
					)}
					{!notice && phase === "idle" && (
						<button className="update-menu" type="button" onClick={() => setNotice(true)}>
							Update available
						</button>
					)}
					{phase === "done" && (
						<div className="update-returned" role="status">
							spool is up to date.
						</div>
					)}
				</div>
				<div className="update-cover" aria-hidden={!covered} inert={!covered}>
					<div className="update-fallback" />
					<CoverField take={take} amount={amount} exiting={exiting} />
					<div className="update-message" role="status" aria-live="polite">
						<SpoolMark className="update-mark" />
						<h1>{failed ? "The update couldn’t finish." : "Updating spool"}</h1>
						<p>
							{failed
								? "Your canvas is still here."
								: slow
									? "Still updating. Your canvas will return here."
									: "Your canvas will return here."}
						</p>
						{failed && (
							<button type="button" onClick={reset}>
								Return to canvas
							</button>
						)}
					</div>
				</div>
			</div>
			<footer className="update-tools">
				<div className="update-about">
					<h2>{spec.name}</h2>
					<p>{spec.description}</p>
					<small>Simulated update. This does not install anything.</small>
				</div>
				<div className="update-controls">
					<label>
						Wait{" "}
						<select value={wait} disabled={active} onChange={(event) => setWait(Number(event.target.value))}>
							<option value={650}>Quick update</option>
							<option value={1500}>1.5 seconds</option>
							<option value={5000}>5 seconds</option>
							<option value={10000}>10 seconds</option>
							<option value={20000}>20 seconds</option>
						</select>
					</label>
					<label>
						<input
							type="checkbox"
							checked={hold}
							disabled={active}
							onChange={(event) => setHold(event.target.checked)}
						/>
						Hold until ready
					</label>
					{phase === "waiting" ? (
						<>
							<button
								type="button"
								onClick={() => {
									release.current = true;
								}}
							>
								Ready
							</button>
							<button type="button" onClick={fail}>
								Fail
							</button>
						</>
					) : null}
					<button type="button" onClick={reset}>
						Canvas
					</button>
					<button ref={play} className="update-play" type="button" disabled={active} onClick={start}>
						Play transition <span aria-hidden="true">↗</span>
					</button>
				</div>
			</footer>
		</main>
	);
}
