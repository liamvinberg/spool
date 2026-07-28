import type { ReactNode } from "react";
import {
	AgentCell,
	type AgentGlyph,
	CellBox,
	type Cell,
	LinkCell,
	type LinkGlyph,
	type Treatment,
} from "./marks";

/**
 * agent-nav-marks — the two marks, at the size they ship at.
 *
 * A sheet rather than a screen, because the thing being decided is a 14px drawing and
 * the four layout frames next door are the wrong instrument for it: each one spends
 * 1440×900 to show two glyphs the size of a full stop. Every candidate here is drawn
 * in a real 44px cell of the real strip, in all four states, with a 2.5× blow-up beside
 * it. Nothing is judged blown up alone — that is how an icon that only works when it is
 * huge gets picked.
 *
 * **Three decisions, untangled.** The first pass drew one answer to all of them at
 * once and lost on each: a speech bubble for the agent, the canvas's own flow arrow
 * for connections, and #136's mark parked underneath the glyph.
 *
 * *What the glyph is.* `log` is the rail's self-portrait — a mark and a line, twice,
 * which is exactly what the pane renders. `prompt` says say something and risks
 * saying terminal, which this canvas already uses for real (`term.tsx`). `said` is
 * two turns of a conversation with nobody's bubble around them. `ring` is the rail's
 * own ring promoted from state to identity.
 *
 * *Where the state lives.* One measurement decides most of this: #136's mark is a
 * 9px ring in a 14px box, and that is about the floor at which turning still reads as
 * turning. So a state hidden inside a 3px dot is not on the table. `under` is the
 * rejected control. `orbit` gives the state the ring *around* the glyph, which is the
 * one place a 9px moving thing fits without becoming a second object. `write` puts
 * the motion inside the glyph — the log draws its own lines, which is what the pane
 * is doing while you are not looking. `self` deletes the distinction: the ring is
 * the glyph, thin at rest, turning while work happens, filled when something is
 * waiting to be read.
 *
 * *What connections is.* `arrow` is the control and it is the canvas's threads
 * toggle, so it already means something else in the same window. `fanout` is one
 * frame and what it points at, which is what the pane lists. `edge` is two frames and
 * the walk between them. `count` deletes the glyph: the number is the whole cell,
 * which is the most spool answer and the least legible one.
 *
 * **The states are #136's, unchanged.** Turning while any thread works, filled or
 * dotted when one finished unread, nothing once read, never colour — the one accent
 * belongs to the selection. `open` is the pane you are in, and its 2px bar is drawn
 * here because a cell has to be judged wearing it.
 *
 * **What is still not decided anywhere on this sheet** is a fourth state for a turn
 * stopped on an approval, which #121 settled nobody is notified of. Every candidate
 * here would draw it the same as working.
 *
 * **Settled: `log`, `orbit`, `edge`**, marked on their rows. They moved into
 * `shared/ui/` and every layout frame on this page draws them now; the losers stay
 * here, because the next session's first instinct will be the bubble again. The
 * count settled with them and it sits *beside* its glyph — under is where a state
 * was tried and rejected, and a label is a different thing.
 */

const STATES: readonly Cell[] = ["rest", "working", "unread", "open"];

function Sheet({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{children}
		</div>
	);
}

const BLOWN = 2.5;

function Head({ title, note }: { title: string; note: string }) {
	return (
		<div className="flex shrink-0 items-baseline gap-3 border-border border-y bg-surface/40 px-5 py-1.5">
			<span className="font-mono text-sm text-text leading-4">{title}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/70 leading-3">{note}</span>
		</div>
	);
}

/** the column titles, once, because every row underneath is the same four states */
function Legend() {
	return (
		<div className="flex shrink-0 items-center px-5 py-1">
			<span className="w-[104px] shrink-0" />
			{STATES.map((state) => (
				<span key={state} className="w-12 shrink-0 text-center font-mono text-2xs text-muted/45 leading-3">
					{state}
				</span>
			))}
			<span className="w-[72px] shrink-0 pl-3 font-mono text-2xs text-muted/45 leading-3">2.5×</span>
			<span className="font-mono text-2xs text-muted/45 leading-3">what it says</span>
		</div>
	);
}

function Row({
	name,
	note,
	picked = false,
	children,
	blown,
}: {
	name: string;
	note: string;
	/** the one the maintainer took, kept on the sheet so the losers stay legible as losers */
	picked?: boolean;
	children: ReactNode;
	blown: ReactNode;
}) {
	return (
		<div className="flex h-[68px] shrink-0 items-center px-5">
			<span className="flex w-[104px] shrink-0 flex-col gap-0.5">
				<span className="font-mono text-sm text-text/85 leading-4">{name}</span>
				{picked ? <span className="font-mono text-2xs text-thread leading-3">picked</span> : null}
			</span>
			{children}
			<span className="flex w-[72px] shrink-0 items-center justify-start pl-3">{blown}</span>
			<span className="min-w-0 flex-1 font-mono text-2xs text-muted leading-4">{note}</span>
		</div>
	);
}

const GLYPHS: readonly { glyph: AgentGlyph; name: string; note: string; picked?: boolean }[] = [
	{ glyph: "log", name: "log", picked: true, note: "a mark and a line, twice — the pane drawn as itself" },
	{ glyph: "prompt", name: "prompt", note: "say something; collides with the terminal frames on this canvas" },
	{ glyph: "said", name: "said", note: "two turns of a conversation, no bubble borrowed" },
	{ glyph: "ring", name: "ring", note: "the rail's ring as identity — weakest alone, strongest with self" },
];

const TREATMENTS: readonly { treatment: Treatment; glyph: AgentGlyph; name: string; note: string; picked?: boolean }[] = [
	{ treatment: "under", glyph: "log", name: "under", note: "the rejected control: two objects pretending to be one" },
	{ treatment: "orbit", glyph: "log", name: "orbit", picked: true, note: "the state is the ring around the glyph — 9px, so it reads" },
	{ treatment: "write", glyph: "log", name: "write", note: "the motion is inside the glyph: the log writes its own lines" },
	{ treatment: "self", glyph: "ring", name: "self", note: "no distinction left — the ring is both, thin, turning, filled" },
];

const LINKS: readonly { glyph: LinkGlyph; name: string; note: string; picked?: boolean }[] = [
	{ glyph: "arrow", name: "arrow", note: "the control, and already the header's threads toggle" },
	{ glyph: "fanout", name: "fanout", note: "one frame and what it points at — what the pane lists" },
	{ glyph: "edge", name: "edge", picked: true, note: "two frames and the walk between them" },
	{ glyph: "count", name: "count", note: "no glyph at all; the number is the cell, and — is no selection" },
];

/** the strip as it would really stand, at real size, for the three that survive a look */
function Strip({ glyph, treatment, link }: { glyph: AgentGlyph; treatment: Treatment; link: LinkGlyph }) {
	return (
		<div className="flex w-11 flex-col items-center border-border border-l pt-1">
			<CellBox state="working">
				<AgentCell glyph={glyph} treatment={treatment} state="working" />
			</CellBox>
			<CellBox state="rest">
				<LinkCell glyph={link} links={2} active={false} />
			</CellBox>
		</div>
	);
}

export default function AgentNavMarksFrame() {
	return (
		<Sheet>
			<Head title="nav marks" note="#144 — the agent and connections, 14px in a 44px cell, plus 2.5×" />
			<Legend />

			<Head title="the agent's glyph" note="state held at orbit so only the drawing changes" />
			{GLYPHS.map((row) => (
				<Row
					key={row.glyph}
					name={row.name}
					note={row.note}
					picked={row.picked === true}
					blown={<AgentCell glyph={row.glyph} treatment="orbit" state="working" scale={BLOWN} />}
				>
					{STATES.map((state) => (
						<span key={state} className="flex w-12 shrink-0 justify-center"><CellBox state={state}>
							<AgentCell glyph={row.glyph} treatment="orbit" state={state} />
						</CellBox></span>
					))}
				</Row>
			))}

			<Head title="where the state lives" note="glyph held at log, except self, which is the ring" />
			{TREATMENTS.map((row) => (
				<Row
					key={row.treatment}
					name={row.name}
					note={row.note}
					picked={row.picked === true}
					blown={<AgentCell glyph={row.glyph} treatment={row.treatment} state="working" scale={BLOWN} />}
				>
					{STATES.map((state) => (
						<span key={state} className="flex w-12 shrink-0 justify-center"><CellBox state={state}>
							<AgentCell glyph={row.glyph} treatment={row.treatment} state={state} />
						</CellBox></span>
					))}
				</Row>
			))}

			<Head title="connections" note="a count, not a life — it sits still and it is absent with nothing selected" />
			{LINKS.map((row) => (
				<Row
					key={row.glyph}
					name={row.name}
					note={row.note}
					picked={row.picked === true}
					blown={<LinkCell glyph={row.glyph} links={2} active={false} scale={BLOWN} />}
				>
					{STATES.map((state) => (
						<span key={state} className="flex w-12 shrink-0 justify-center"><CellBox state={state}>
							<LinkCell glyph={row.glyph} links={state === "rest" ? null : 2} active={state === "open"} />
						</CellBox></span>
					))}
				</Row>
			))}

			<Head title="standing up" note="the shut strip at real size: agent working, connections at rest" />
			<div className="flex flex-1 items-start gap-10 px-6 py-4">
				{[
					{ glyph: "log" as AgentGlyph, treatment: "orbit" as Treatment, link: "fanout" as LinkGlyph },
					{ glyph: "log" as AgentGlyph, treatment: "write" as Treatment, link: "edge" as LinkGlyph },
					{ glyph: "ring" as AgentGlyph, treatment: "self" as Treatment, link: "count" as LinkGlyph },
				].map((combo) => (
					<div key={`${combo.treatment}-${combo.link}`} className="flex flex-col gap-2">
						<Strip glyph={combo.glyph} treatment={combo.treatment} link={combo.link} />
						<span className="font-mono text-2xs text-muted/60 leading-3">
							{combo.treatment} · {combo.link}
						</span>
					</div>
				))}
			</div>
		</Sheet>
	);
}
