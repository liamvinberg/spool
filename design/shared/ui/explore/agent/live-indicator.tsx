import { useEffect, useState } from "react";
import { ChevronIcon, PlusIcon } from "shared/ui/spool/icons";
import "./live-indicator.css";

/** Throwaway: three live-end directions, each a separate frame. Endings are simulated. */
export type Indicator = "pulse" | "thread" | "writing";
type Ending = "live" | "done" | "stopped" | "disconnected";
type Playback = { started: number; held: number; ending: Ending; loop: boolean };

const PERIOD = 18_000;
const COMPLETE = 12_000;
const FIRST = "The tab bar has more room now. The active tab stays clear without adding another border.";
const SECOND = "I kept the close button quiet until you hover, and aligned the icons with the labels.";

function Check() {
	return <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true"><path d="m3.4 7.2 2.4 2.4 4.8-5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IndicatorMark({ take }: { take: Indicator }) {
	return (
		<span data-live-indicator={take} className={`live-indicator live-${take}`} role="status" aria-label="Writing">
			{take === "pulse" ? <span className="live-pulse-bar" aria-hidden="true" /> : null}
			{take === "thread" ? <span className="live-thread-track" aria-hidden="true"><span /></span> : null}
			{take === "writing" ? <><svg className="live-writing-ring" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeOpacity=".2" /><path d="M6 2a4 4 0 0 1 4 4" stroke="currentColor" strokeLinecap="round" /></svg><span>writing</span></> : null}
		</span>
	);
}

export function LiveIndicator({ take, history = false }: { take: Indicator; history?: boolean }) {
	const [now, setNow] = useState(() => Date.now());
	const [playback, setPlayback] = useState<Playback>(() => ({ started: 0, held: COMPLETE, ending: history ? "done" : "live", loop: !history }));
	useEffect(() => {
		if (playback.ending !== "live") return;
		const timer = window.setInterval(() => setNow(Date.now()), 100);
		return () => window.clearInterval(timer);
	}, [playback.ending]);
	const elapsed = playback.ending === "live" ? (playback.loop ? now % PERIOD : now - playback.started) : playback.held;
	const ending = playback.ending === "live" && elapsed >= COMPLETE ? "done" : playback.ending;
	const live = ending === "live";
	const first = elapsed >= 4200 || ending === "done";
	const second = elapsed >= 8500 || ending === "done";
	const partial = ending === "stopped" || ending === "disconnected";
	const marker = live ? <IndicatorMark take={take} /> : null;
	const finish = (next: Ending) => {
		const at = Date.now();
		setNow(at);
		setPlayback(next === "live" ? { started: at, held: 0, ending: "live", loop: false } : { started: at, held: next === "done" ? COMPLETE : Math.min(elapsed, COMPLETE - 1), ending: next, loop: false });
	};

	return (
		<div data-indicator-preview={take} data-preview-state={ending} className="live-preview flex h-full flex-col bg-bg font-sans text-text antialiased">
			<section aria-label="Agent preview" className="flex min-h-0 flex-1 flex-col border-border border-x">
				<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b px-3">
					<span className="min-w-0 flex-1 truncate type-control">Tighten the tab bar</span>
					<ChevronIcon className="h-3 w-3 rotate-90 text-muted" />
					<PlusIcon className="ml-3 h-3 w-3 text-muted" />
				</div>
				<div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 pb-5">
					<div className="mb-7 ml-10 self-end rounded-sm bg-surface px-3 py-2.5 type-body">Can you give the tabs a little more space and quiet down the close button?</div>
					<div className="mb-4 flex items-center gap-2 text-muted type-value"><Check /><span>thinking</span><span className="text-muted/65">2.1s</span></div>
					<p className="mb-4 type-body">I’ll check the tab bar and adjust the spacing.</p>
					<div className="mb-5 flex items-center gap-2 text-muted type-value"><Check /><span>read</span><span className="text-text">tabbar.tsx</span><ChevronIcon className="ml-0.5 h-3 w-3 text-muted/50" /></div>
					<div className="live-preview-prose type-body" key={playback.loop ? Math.floor(now / PERIOD) : playback.started}>
						{first ? <p className={history || partial ? undefined : "live-paragraph-arrive"}>{FIRST}{!second && take !== "writing" ? marker : null}</p> : null}
						{second ? <p className={history || partial ? "mt-2" : "live-paragraph-arrive mt-2"}>{SECOND}{take !== "writing" ? marker : null}</p> : null}
						{live && (!first || take === "writing") ? <div className={first ? "mt-3 flex h-5 items-center" : "flex h-5 items-center"}>{marker}</div> : null}
						{partial ? <p className={first ? "mt-2" : undefined}>{second ? "The updated frame" : first ? "I kept the close button" : "The tab bar has more room"}</p> : null}
						{ending === "stopped" ? <div className="mt-4 text-muted type-value">stopped</div> : null}
						{ending === "disconnected" ? <div role="status" className="mt-4 text-muted type-value">connection lost · reconnecting</div> : null}
					</div>
				</div>
				<div className="shrink-0 border-border border-t px-3 py-3">
					<div className="flex h-12 items-start justify-between pt-0.5 text-muted type-body"><span>say what to change</span>{live ? <button type="button" aria-label="Stop generation" onClick={() => finish("stopped")} className="flex h-6 w-6 items-center justify-center rounded-xs bg-surface text-text"><span className="h-2 w-2 rounded-[1px] bg-current" /></button> : <span className="text-muted/60">↑</span>}</div>
					<div className="flex items-center justify-between text-muted type-detail"><span>spool</span><span>claude sonnet 4.6 <span className="ml-1 text-muted/50">⌄</span></span></div>
				</div>
			</section>
			<div className="flex h-12 shrink-0 items-center justify-between border-border border-t bg-canvas px-3 type-label" aria-label="Prototype controls">
				<span className="text-muted" data-preview-readout="">{ending === "live" ? "Live" : ending === "done" ? "History" : ending === "stopped" ? "Stopped" : "Disconnected"}</span>
				<div className="flex gap-3">
					<button type="button" onClick={() => finish("live")} className="preview-button">Replay</button>
					<button type="button" onClick={() => finish("done")} className="preview-button">Finish</button>
					<button type="button" onClick={() => finish("stopped")} className="preview-button">Stop</button>
					<button type="button" onClick={() => finish("disconnected")} className="preview-button">Disconnect</button>
				</div>
			</div>
		</div>
	);
}
