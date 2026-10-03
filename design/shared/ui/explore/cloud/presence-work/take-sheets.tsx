import type { ReactNode } from "react";
import { UnseenMark } from "shared/ui/spool/unseen-mark";
import {
	agentName,
	alpha,
	type Camera,
	clamp,
	easeInOut,
	easeOut,
	edgeOf,
	type FrameDef,
	featuresAt,
	frameRect,
	MEMBERS,
	onScreen,
	PHONE_H,
	PHONE_W,
	pathAt,
	plate,
	type Scene,
	toScreen,
	type Turn,
	typed,
	VIEW_H,
	type Who,
	type Write,
} from "./model";
import { AWAY_LOOKS, followMix } from "./scenes";
import { type BlockMark, KaffeScreen } from "./screens";
import {
	type EdgeItem,
	EdgeMarks,
	EdgePill,
	FollowChip,
	FollowRing,
	FrameName,
	FramesLayer,
	Glyph,
	Pointer,
	PresenceWindow,
	useLoop,
	You,
} from "./stage";

/**
 * work-sheets: every write is a fresh print, and the old one goes on the pile.
 *
 * A frame an agent is changing grows a stack. Each write lays the new version down over
 * the old one as a wipe, its leading edge in the colour of whoever's agent made it, and
 * the old print slides one step back behind the frame. So the frame is never anything
 * but its current self, and the pile behind it says how much changed and whose hands it
 * went through: three amber edges and one blue is Ana's claude three times and Ben's
 * codex once. The pile is a shape, so it stays readable at any zoom.
 *
 * Go inside a frame and the pile deals itself out beside it as a contact sheet, before
 * on the left and now on the right, every print captioned with the line that made it.
 * That is where the ask is written. Out on the canvas, the work speaks in pixels only.
 */

const LINGER = 6;
const WIPE = 0.62;
const DEAL = 0.5;

interface Sheet {
	readonly write: Write;
	readonly who: Who;
	readonly turn: Turn;
}

/** the prints a frame is carrying at t: one per landed write of a turn still being shown */
function sheetsOf(scene: Scene, frame: string, t: number, keep: (turn: Turn) => boolean): Sheet[] {
	const sheets: Sheet[] = [];
	for (const turn of scene.turns) {
		if (turn.frame !== frame || !keep(turn)) continue;
		for (const write of turn.writes) if (write.at <= t) sheets.push({ write, who: turn.who, turn });
	}
	return sheets.sort((a, b) => a.write.at - b.write.at);
}

/** how far apart the prints sit, in screen pixels, at this zoom */
const stepAt = (k: number) => clamp(14 * k, 3, 9);

/* ---------- the pile ---------- */

function Pile({ frame, cam, sheets, t, settle }: { frame: FrameDef; cam: Camera; sheets: readonly Sheet[]; t: number; settle: number }) {
	const r = frameRect(cam, frame);
	const step = stepAt(cam.k);
	const shown = sheets.slice(-6);
	const radius = Math.max(3, 22 * cam.k);
	return (
		<>
			{shown.map((sheet, index) => {
				const depth = shown.length - index;
				// a print that just came off slides back over DEAL, and every print behind it steps back with it
				const fresh = easeOut((t - sheet.write.at) / DEAL);
				const newer = shown.slice(index + 1).filter((other) => t - other.write.at < DEAL);
				const travel = depth - 1 + (newer.length === 0 ? fresh : newer.reduce((sum, other) => sum + easeOut((t - other.write.at) / DEAL), 0) / newer.length);
				const off = travel * step * settle;
				const color = MEMBERS[sheet.who].color;
				return (
					<div
						key={`${sheet.turn.id}-${sheet.write.at}`}
						aria-hidden="true"
						className="pointer-events-none absolute"
						style={{
							left: r.x + off,
							top: r.y + off,
							width: r.w,
							height: r.h,
							borderRadius: radius,
							zIndex: 0,
							background: `color-mix(in srgb, #FEFEFE ${Math.round(88 - depth * 9)}%, #161616)`,
							boxShadow: `inset 0 0 0 1.5px ${alpha(color, 0.95 - depth * 0.08)}`,
						}}
					/>
				);
			})}
		</>
	);
}

/** the print that was there a moment ago, wiped away top to bottom to show the new one */
function Wipe({ scene, frame, cam, sheet, t }: { scene: Scene; frame: FrameDef; cam: Camera; sheet: Sheet; t: number }) {
	const age = t - sheet.write.at;
	if (age < 0 || age > WIPE + 0.05) return null;
	const p = easeInOut(age / WIPE);
	const r = frameRect(cam, frame);
	const before = featuresAt(scene.turns, frame.name, sheet.write.at - 0.001);
	const color = MEMBERS[sheet.who].color;
	return (
		<div className="pointer-events-none absolute z-[1]" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
			<div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${p * 100}% 0 0 0 round ${22 * cam.k}px)` }}>
				<div className="origin-top-left" style={{ transform: `scale(${cam.k})` }}>
					<KaffeScreen kind={frame.kind} features={settled(before)} title={frame.title} seed={frame.seed} />
				</div>
			</div>
			<div
				className="absolute inset-x-[-4px] h-[2px] rounded-full"
				style={{ top: p * r.h - 1, background: color, opacity: clamp((WIPE + 0.05 - age) / 0.15) }}
			/>
		</div>
	);
}

const settled = (features: Record<string, number>) => Object.fromEntries(Object.keys(features).map((name) => [name, 10]));

/** a block lights as the wipe passes over it, not before */
function marksFor(frame: FrameDef, sheets: readonly Sheet[], t: number, ring: number): Record<string, BlockMark> {
	const marks: Record<string, BlockMark> = {};
	for (const sheet of sheets) {
		const ink = plate(t - sheet.write.at - WIPE * 0.55);
		const prev = marks[sheet.write.block];
		if (prev === undefined || ink >= prev.ink) marks[sheet.write.block] = { color: MEMBERS[sheet.who].color, ink, ring };
	}
	void frame;
	return marks;
}

/* ---------- the contact sheet ---------- */

/**
 * Inside a frame, the pile deals out beside it: the print before the turn began, then
 * every print since, each captioned with the line that made it. Newest last, so the row
 * reads left to right as before and after.
 */
function Contact({ scene, frame, cam, sheets, t, open }: { scene: Scene; frame: FrameDef; cam: Camera; sheets: readonly Sheet[]; t: number; open: number }) {
	if (open <= 0.01) return null;
	const r = frameRect(cam, frame);
	const first = sheets[0];
	const prints: { key: string; features: Record<string, number>; label: ReactNode; who: Who | null }[] = [];
	if (first !== undefined) {
		prints.push({
			key: "before",
			features: settled(featuresAt(scene.turns, frame.name, Math.min(first.turn.start, first.write.at) - 0.001)),
			label: <span className="text-muted">before</span>,
			who: null,
		});
	}
	for (const sheet of sheets) {
		prints.push({
			key: `${sheet.turn.id}-${sheet.write.at}`,
			features: settled(featuresAt(scene.turns, frame.name, sheet.write.at)),
			label: <span className="text-text">{typed(sheet.write.note, t - sheet.write.at)}</span>,
			who: sheet.who,
		});
	}
	const shown = prints.slice(-6);
	const s = 0.22;
	const asks = [...new Map(sheets.map((sheet) => [sheet.turn.id, sheet.turn])).values()];
	return (
		<div className="pointer-events-none absolute z-10 flex flex-col gap-4" style={{ left: r.x + r.w + 36 + 6 * stepAt(cam.k), top: r.y, width: 3 * (PHONE_W * s + 14), opacity: open }}>
			<div className="flex flex-col gap-2">
				{asks.map((turn) => (
					<p key={turn.id} className="type-label text-text">
						<span className="font-medium" style={{ color: MEMBERS[turn.who].color }}>
							{MEMBERS[turn.who].name}
						</span>{" "}
						{turn.ask}
					</p>
				))}
			</div>
			<div className="grid grid-cols-3 gap-x-3.5 gap-y-3">
				{shown.map((print, index) => {
					const arrive = print.who === null ? 1 : easeOut((t - (sheets.find((sheet) => `${sheet.turn.id}-${sheet.write.at}` === print.key)?.write.at ?? 0)) / 0.45);
					return (
						<div key={print.key} className="flex flex-col gap-1.5" style={{ opacity: arrive, transform: `translateY(${(1 - arrive) * 6}px)` }}>
							<div
								className="overflow-hidden"
								style={{
									width: PHONE_W * s,
									height: PHONE_H * s,
									borderRadius: 22 * s,
									boxShadow: print.who === null ? undefined : `0 0 0 1.5px ${alpha(MEMBERS[print.who].color, index === shown.length - 1 ? 1 : 0.55)}`,
								}}
							>
								<div className="origin-top-left" style={{ transform: `scale(${s})` }}>
									<KaffeScreen kind={frame.kind} features={print.features} title={frame.title} seed={frame.seed} />
								</div>
							</div>
							<span className="flex items-start gap-1.5 type-detail">
								{print.who === null ? null : <span className="mt-[5px]"><Glyph who={print.who} agent size={6} /></span>}
								{print.label}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/* ---------- a frame in a pocket: the miniature a pointer or an edge carries ---------- */

function Mini({ scene, frame, t, height = 54 }: { scene: Scene; frame: FrameDef; t: number; height?: number }) {
	const s = height / PHONE_H;
	const sheets = sheetsOf(scene, frame.name, t, (turn) => t < turn.end + LINGER);
	const last = sheets.at(-1);
	const wipe = last === undefined ? 1 : clamp((t - last.write.at) / WIPE);
	const shown = sheets.slice(-4);
	return (
		<span className="relative block shrink-0" style={{ width: PHONE_W * s + shown.length * 2, height: height + shown.length * 2 }}>
			{shown.map((sheet, index) => {
				const depth = shown.length - index;
				return (
					<span
						key={`${sheet.turn.id}-${sheet.write.at}`}
						className="absolute block"
						style={{
							left: depth * 2,
							top: depth * 2,
							width: PHONE_W * s,
							height,
							borderRadius: 3,
							background: "#cfcfd2",
							boxShadow: `inset 0 0 0 1px ${MEMBERS[sheet.who].color}`,
						}}
					/>
				);
			})}
			<span className="absolute top-0 left-0 block overflow-hidden" style={{ width: PHONE_W * s, height, borderRadius: 3 }}>
				<span className="block origin-top-left" style={{ transform: `scale(${s})` }}>
					<KaffeScreen kind={frame.kind} features={settled(featuresAt(scene.turns, frame.name, t))} title={frame.title} seed={frame.seed} />
				</span>
				{last === undefined || wipe >= 1 ? null : (
					<span className="absolute inset-x-0 block h-[1.5px]" style={{ top: easeInOut(wipe) * height, background: MEMBERS[last.who].color }} />
				)}
			</span>
		</span>
	);
}

/* ---------- the take ---------- */

export function SheetsTake({ scene }: { scene: Scene }) {
	const clock = useLoop(scene.duration, scene.poster);
	const t = clock.t;
	const cam = scene.camera(t);
	const away = scene.away;
	const story = away === undefined ? t : away.story;
	const following = scene.follow?.find((span) => t >= span.from && t < span.to);
	const mix = scene.name === "follow" ? followMix(t) : 0;

	// coming back: each frame you look at riffles its pile from where you left it to now
	const look = (frame: string) => AWAY_LOOKS.find((candidate) => candidate.frame === frame);
	const viewT = (frame: FrameDef) => {
		if (away === undefined) return t;
		const seen = look(frame.name);
		if (seen === undefined || t < seen.from) return story;
		const sheets = sheetsOf(scene, frame.name, story, () => true);
		const first = sheets[0];
		if (first === undefined) return story;
		// rewind to just before the first print, then play each one 0.75s apart
		const u = t - seen.from;
		if (u < 0.5) return first.write.at - 0.001;
		const index = Math.floor((u - 0.5) / 0.75);
		const sheet = sheets[index];
		if (sheet === undefined) return story;
		return sheet.write.at + ((u - 0.5) % 0.75);
	};
	const settleOf = (frame: FrameDef, turn: Turn | undefined) => {
		if (away !== undefined) {
			const seen = look(frame.name);
			if (seen === undefined) return 1;
			if (t < seen.from) return 1;
			return t < seen.done ? 1 : clamp(1 - (t - seen.done) / 0.6);
		}
		if (turn === undefined) return 0;
		if (t < turn.end + LINGER) return 1;
		return clamp(1 - (t - turn.end - LINGER) / 0.6);
	};

	const entered = scene.entered !== undefined && t >= scene.entered.from && t < scene.entered.to ? scene.entered.frame : undefined;
	const dealt = scene.entered === undefined ? 0 : easeOut((t - scene.entered.from) / 0.5) * clamp((scene.entered.to - t) / 0.3);

	const piles = scene.frames.map((frame) => {
		const ft = viewT(frame);
		const keep = (turn: Turn) => (away !== undefined ? true : t < turn.end + LINGER + 0.6);
		const sheets = sheetsOf(scene, frame.name, ft, keep);
		const lastTurn = sheets.at(-1)?.turn;
		return { frame, ft, sheets, settle: settleOf(frame, lastTurn) };
	});

	const header =
		following !== undefined ? (
			<FollowChip who="ana" agent={mix > 0.5} text={mix > 0.5 ? `following ${agentName("ana")}` : "Following Ana"} />
		) : away !== undefined ? (
			<span className="flex h-7 items-center gap-2 text-muted type-detail">
				<UnseenMark mark="changed" />
				{`${4 - AWAY_LOOKS.filter((candidate) => t >= candidate.done + 0.6).length} frames changed since ${away.left}`}
			</span>
		) : undefined;

	const edge: EdgeItem[] = [];

	return (
		<PresenceWindow scene={scene} clock={clock} header={header}>
			{piles.map((pile) =>
				pile.sheets.length === 0 || pile.settle <= 0 ? null : (
					<Pile key={pile.frame.name} frame={pile.frame} cam={cam} sheets={pile.sheets} t={pile.ft} settle={pile.settle} />
				),
			)}
			<div className="absolute inset-0">
				{away === undefined ? (
					<FramesLayer
						scene={scene}
						cam={cam}
						t={t}
						marksFor={(frame) => {
							const pile = piles.find((candidate) => candidate.frame === frame);
							return pile === undefined ? undefined : marksFor(frame, pile.sheets, t, 0.3 * pile.settle);
						}}
					/>
				) : (
					piles.map((pile) => (
						<FramesLayer
							key={pile.frame.name}
							scene={{ ...scene, frames: [pile.frame] }}
							cam={cam}
							t={pile.ft}
							marksFor={(frame) => marksFor(frame, pile.sheets, pile.ft, 0.3 * pile.settle)}
						/>
					))
				)}
				{piles.map((pile) => {
					const last = pile.sheets.at(-1);
					return last === undefined ? null : <Wipe key={pile.frame.name} scene={scene} frame={pile.frame} cam={cam} sheet={last} t={pile.ft} />;
				})}
			</div>

			{piles.map((pile) => {
				const r = frameRect(cam, pile.frame);
				const visible = r.x < 1148 && r.x + r.w > 0 && r.y < VIEW_H && r.y + r.h > 0;
				const turns = [...new Map(pile.sheets.map((sheet) => [sheet.turn.id, sheet.turn])).values()];
				const reading = scene.turns.filter((turn) => turn.frame === pile.frame.name && t >= turn.start && t < turn.end && !turns.includes(turn) && away === undefined);
				const all = [...turns, ...reading];
				if (!visible) {
					const turn = all.at(-1);
					if (turn !== undefined && pile.settle > 0) {
						const c = toScreen(cam, pile.frame.x + PHONE_W / 2, pile.frame.y + 300);
						edge.push({
							key: `pile-${pile.frame.name}`,
							x: c.x,
							y: c.y,
							height: 76,
							node: (side) => (
								<EdgePill side={side} color={MEMBERS[turn.who].color}>
									<span className="flex items-center gap-2.5">
										<Mini scene={scene} frame={pile.frame} t={pile.ft} />
										<span className="flex flex-col gap-0.5">
											<span className="flex items-center gap-1.5 type-detail" style={{ color: MEMBERS[turn.who].color }}>
												<Glyph who={turn.who} agent size={6} />
												{agentName(turn.who)}
											</span>
											<span className="text-text type-detail">{pile.frame.name}</span>
											<span className="text-muted type-detail">
												{pile.sheets.length} {pile.sheets.length === 1 ? "change" : "changes"}
												{away === undefined ? "" : ` since ${away.left}`}
											</span>
										</span>
									</span>
								</EdgePill>
							),
						});
					}
					return null;
				}
				const unseen = away !== undefined && pile.sheets.length > 0 && pile.settle > 0;
				return (
					<FrameName key={pile.frame.name} frame={pile.frame} cam={cam} tone={all.length > 0 ? "text" : "muted"} entered={entered === pile.frame.name}>
						{unseen ? <UnseenMark mark="changed" /> : null}
						{all.length === 0 || pile.settle <= 0 && reading.length === 0 ? null : (
							<span className="ml-auto flex items-center gap-2" style={{ opacity: Math.max(pile.settle, reading.length > 0 ? 1 : 0) }}>
								{all.map((turn) => {
									const count = pile.sheets.filter((sheet) => sheet.turn === turn).length;
									return (
										<span key={turn.id} className="flex items-center gap-1 type-detail" style={{ color: MEMBERS[turn.who].color }}>
											<Glyph who={turn.who} agent={turn.hand !== true} size={6} />
											{cam.k < 0.25 ? null : turn.hand === true ? MEMBERS[turn.who].name : turn.who}
											{count > 0 ? <span className="text-muted">{count}</span> : null}
										</span>
									);
								})}
							</span>
						)}
					</FrameName>
				);
			})}

			{scene.entered === undefined
				? null
				: (() => {
						const frame = scene.frames.find((candidate) => candidate.name === scene.entered?.frame);
						const pile = piles.find((candidate) => candidate.frame === frame);
						if (frame === undefined || pile === undefined) return null;
						const all = sheetsOf(scene, frame.name, t, () => true);
						return <Contact scene={scene} frame={frame} cam={cam} sheets={all} t={t} open={dealt} />;
					})()}

			{scene.pointers.map((path) => {
				const at = pathAt(path.keys, t);
				const p = toScreen(cam, at.x, at.y);
				const mine = scene.turns.filter((turn) => turn.who === path.who && turn.hand !== true && t >= turn.start && t < turn.end && away === undefined).at(-1);
				const frame = mine === undefined ? undefined : scene.frames.find((candidate) => candidate.name === mine.frame);
				let apart = false;
				if (frame !== undefined) {
					const fr = frameRect(cam, frame);
					const dx = Math.max(fr.x - p.x, 0, p.x - (fr.x + fr.w));
					const dy = Math.max(fr.y - p.y, 0, p.y - (fr.y + fr.h));
					apart = Math.hypot(dx, dy) > Math.max(60, fr.w * 0.5);
				}
				const pocket = apart && frame !== undefined ? <Mini scene={scene} frame={frame} t={t} height={cam.k < 0.25 ? 34 : 44} /> : null;
				if (!onScreen(p.x, p.y, 4)) {
					const agentOff = frame !== undefined && !onScreen(frameRect(cam, frame).x + 10, frameRect(cam, frame).y + 10, 0);
					const together = agentOff && frame !== undefined && edgeOf(p.x, p.y, 14).side === edgeOf(toScreen(cam, frame.x, frame.y).x, toScreen(cam, frame.x, frame.y).y, 14).side;
					if (together) return null;
					edge.push({
						key: `person-${path.who}`,
						x: p.x,
						y: p.y,
						height: pocket === null ? 30 : 62,
						node: (side) => (
							<EdgePill side={side} color={MEMBERS[path.who].color}>
								<span className="flex items-center gap-2">
									<span className="flex items-center gap-1.5 type-caption" style={{ color: MEMBERS[path.who].color }}>
										<Glyph who={path.who} agent={false} size={6} />
										{MEMBERS[path.who].name}
									</span>
									{pocket}
								</span>
							</EdgePill>
						),
					});
					return null;
				}
				return (
					<Pointer key={path.who} who={path.who} x={p.x} y={p.y}>
						{pocket === null ? null : <span className="-my-px py-0.5">{pocket}</span>}
					</Pointer>
				);
			})}

			<You scene={scene} cam={cam} t={t} />
			<EdgeMarks items={edge} />
			{following === undefined ? null : <FollowRing color={MEMBERS.ana.color} ink={0.9} />}
		</PresenceWindow>
	);
}
