import { useEffect, useRef, useState } from "react";
import type { TextRecording } from "shared/lib/explore/agent/received-text";
import { receivedAt } from "shared/lib/explore/agent/received-text";
import { useStillness } from "shared/lib/spool/stillness";
import { Paragraphs, paragraphsOf } from "shared/ui/spool/agent-said";
import recordingData from "shared/lib/explore/agent/received-recording.json";
import "./received-indicator.css";

type Take = "trail" | "wind" | "words";
const recording: TextRecording = { ...recordingData, timing: recordingData.timing === "recorded" ? "recorded" : "estimated" };
const HOLD = 5000;

/** Decorative distance follows received characters. A sweep is 64 characters, not a token. */
function ReceivedMark({ take, text }: { take: Take; text: string }) {
	const strand = useRef<HTMLSpanElement>(null);
	const mark = useRef<HTMLSpanElement>(null);
	const signal = useRef({ target: text.length, drawn: text.length, changed: performance.now() });
	useEffect(() => {
		if (signal.current.target === text.length) return;
		signal.current.target = text.length;
		signal.current.changed = performance.now();
	}, [text]);
	useEffect(() => {
		const node = strand.current;
		if (!node) return;
		const wind = take === "wind";
		const duration = wind ? 1600 : 1800;
		const animation = wind ? node.getAnimations()[0] : node.animate(
			[{ transform: "translateX(-27px)" }, { transform: "translateX(37px)" }],
			{ duration, easing: "cubic-bezier(.35,0,.5,1)", iterations: Infinity },
		);
		if (!animation) return;
		animation.pause();
		let frame = 0;
		let before = performance.now();
		const paint = () => {
			const now = performance.now();
			const state = signal.current;
			const dt = Math.min(64, now - before);
			before = now;
			state.drawn += (state.target - state.drawn) * (1 - Math.exp(-dt / 45));
			if (state.target - state.drawn < .05) state.drawn = state.target;
			animation.currentTime = state.drawn / 64 * duration;
			const idle = now - state.changed > 350;
			if (mark.current) {
				mark.current.dataset.receiving = idle ? "false" : "true";
				mark.current.style.opacity = idle ? ".32" : ".9";
				mark.current.dataset.drawn = state.drawn.toFixed(2);
				mark.current.dataset.received = String(state.target);
			}
			frame = requestAnimationFrame(paint);
		};
		paint();
		return () => { cancelAnimationFrame(frame); animation.cancel(); };
	}, [take]);
	const pending = paragraphsOf(text).at(-1) ?? "";
	const words = pending.slice(-48).replace(/^\S*\s/, "").replace(/[*`#]/g, "");
	return (
		<span ref={mark} data-received-marker={take} className={`received-marker received-${take}`} aria-hidden="true">
			{take === "words" ? <span className="received-phrase">{words}</span> : null}
			<span className="received-track"><span ref={strand} className={take === "wind" ? "received-strand animate-agent-wind" : "received-strand"} /></span>
		</span>
	);
}

/** Only this frame's replay clock is synthetic; recorded chunk spacing stays untouched. */
export function ReceivedIndicator({ take, history = false }: { take: Take; history?: boolean }) {
	const still = useStillness();
	const [wall, setWall] = useState(() => Date.now());
	const [play, setPlay] = useState(() => ({ start: 0, held: history ? recording.finishedAt : 0, mode: history ? "done" : "loop", key: 0 }));
	const period = recording.finishedAt + HOLD;
	const clock = play.mode === "loop" ? wall % period : play.mode === "play" ? wall - play.start : play.held;
	const complete = play.mode === "done" || clock >= recording.finishedAt;
	const ended = complete || play.mode === "stopped";
	const run = play.mode === "loop" ? Math.floor(wall / period) : play.key;
	const elapsed = Math.min(clock, recording.finishedAt);
	const text = receivedAt(recording, elapsed);
	const rate = useRef<{ length: number; at: number; arrivals: { at: number; count: number }[] }>({ length: text.length, at: wall, arrivals: [] });
	if (rate.current.length !== text.length) {
		if (rate.current.length < text.length) rate.current.arrivals.push({ at: wall, count: text.length - rate.current.length });
		else rate.current.arrivals = [];
		rate.current.length = text.length;
		rate.current.at = wall;
	}
	const speed = rate.current.arrivals.filter(a => wall - a.at < 1000).reduce((sum, a) => sum + a.count, 0);
	const quiet = wall - rate.current.at > 750;
	const box = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const timer = window.setInterval(() => setWall(Date.now()), 25);
		return () => window.clearInterval(timer);
	}, []);
	useEffect(() => {
		const viewport = box.current;
		const content = body.current;
		if (!viewport || !content) return;
		const observer = new ResizeObserver(() => { viewport.scrollTop = viewport.scrollHeight; });
		observer.observe(content);
		return () => observer.disconnect();
	}, []);
	const replay = () => {
		const now = Date.now();
		setWall(now);
		rate.current = { length: 0, at: now, arrivals: [] };
		setPlay({ mode: "play", start: now, held: 0, key: now });
	};
	const pause = () => {
		if (play.mode === "pause") setPlay({ ...play, mode: "play", start: Date.now() - play.held });
		else setPlay({ ...play, mode: "pause", held: elapsed, key: run });
	};
	return (
		<div data-received-preview={take} data-recording-timing={recording.timing} data-source-elapsed={elapsed} data-received-length={text.length} className="received-preview flex h-full flex-col bg-bg font-sans text-text antialiased">
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4 type-control"><span>Agent response</span><span className="text-muted type-detail">{recording.model}</span></div>
			<div ref={box} className="pages-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div ref={body} className="flex min-h-full flex-col justify-end px-4 pt-5 pb-5">
					{recording.prompt ? <p className="mb-6 ml-8 rounded-sm bg-surface px-3 py-2.5 type-body">{recording.prompt}</p> : null}
					<div key={run}>
						<Paragraphs text={text} finished={ended} still={still} caret={ended ? undefined : <ReceivedMark take={take} text={text} />} />
					</div>
					{play.mode === "stopped" ? <span className="mt-4 text-muted type-value">stopped</span> : null}
				</div>
			</div>
			<div className="border-border border-t px-4 pt-3 pb-4 text-muted type-body">say what to change<div className="mt-6 text-right type-detail">{recording.model}</div></div>
			<div className="flex shrink-0 flex-col gap-2 border-border border-t bg-canvas px-3 py-3 type-label" aria-label="Replay evidence">
				<div className="flex items-center justify-between"><span>{ended ? "History" : play.mode === "pause" ? "Input paused" : quiet ? "Waiting for text" : "Receiving text"}</span><span className="text-muted tabular-nums" data-receive-rate="">{ended ? 0 : speed} chars/s · {text.length} received</span></div>
				<div className="flex items-center justify-between text-muted"><span>{recording.timing === "recorded" ? "Recorded arrival times · 1×" : "Recorded text · estimated timing"}</span><div className="flex gap-3"><button type="button" onClick={replay}>Replay</button><button type="button" onClick={pause} disabled={ended}>{play.mode === "pause" ? "Resume" : "Pause input"}</button><button type="button" onClick={() => setPlay({ ...play, mode: "stopped", held: elapsed, key: run })}>Stop</button></div></div>
			</div>
		</div>
	);
}
