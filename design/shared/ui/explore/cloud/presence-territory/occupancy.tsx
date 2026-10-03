import { type ActorId, colorOf } from "./cast";
import type { Ctx } from "./ctx";
import { type Mode, PRICE_ROWS, type Rect } from "./world";

/**
 * Who stands on a frame right now, in the order they arrived. Every take asks
 * this one question; they differ only in how they draw the answer.
 */

export type Stance = Mode | "visit" | "reach";

export interface Occupant {
	readonly actor: ActorId;
	readonly stance: Stance;
	/** the block a writer or waiter is at */
	readonly block: number | null;
	/** blocks a shared file draws in this frame, for `reach` */
	readonly blocks: readonly number[];
	readonly since: number;
	readonly file?: string | undefined;
}

export function occupantsOf(ctx: Ctx, frameId: string): Occupant[] {
	const out: Occupant[] = [];
	const f = ctx.frame(frameId);
	if (f === undefined) return out;
	for (const agent of ctx.agents) {
		const file = agent.span.file;
		if (file === undefined) {
			if (agent.frame === frameId) out.push({ actor: agent.actor, stance: agent.mode, block: agent.block, blocks: agent.span.blocks ?? [], since: agent.span.from });
		} else if (f.uses.includes(file)) {
			const stance: Stance = agent.mode === "write" ? "reach" : agent.frame === frameId ? agent.mode : "reach";
			if (stance === "reach" && agent.mode !== "write") continue;
			out.push({ actor: agent.actor, stance, block: null, blocks: PRICE_ROWS[f.screen], since: agent.span.from, file });
		}
	}
	for (const person of ctx.people) {
		if (person.frame?.id === frameId && !out.some((o) => o.actor === person.actor)) {
			out.push({ actor: person.actor, stance: "visit", block: null, blocks: [], since: 0 });
		}
	}
	return out.sort((a, b) => a.since - b.since);
}

/** the shipped plate's envelope: out fast, hold flat, in slow, 860ms */
export function plateAlpha(age: number, peak = 0.16): number {
	const u = age / 0.86;
	if (u < 0 || u > 1) return 0;
	if (u < 0.163) return peak * (1 - (1 - u / 0.163) ** 2);
	if (u < 0.535) return peak;
	const d = (u - 0.535) / 0.465;
	return peak * (1 - d * d);
}

/**
 * Every write in the last 0.86s, as the block it lit on screen. A write to a
 * shared file lights the same block in every frame that renders it.
 */
export function plates(ctx: Ctx): { key: string; rect: Rect; color: string; alpha: number }[] {
	const out: { key: string; rect: Rect; color: string; alpha: number }[] = [];
	for (const w of ctx.writes) {
		const age = ctx.t - w.t;
		if (age < 0 || age > 0.86) continue;
		const alpha = plateAlpha(age, w.file === undefined ? 0.16 : 0.08);
		if (w.file !== undefined) {
			const file = w.file;
			for (const f of ctx.frames) {
				if (!f.uses.includes(file)) continue;
				for (const b of PRICE_ROWS[f.screen]) {
					const rect = ctx.blockScreen(f.id, b);
					if (rect !== undefined) out.push({ key: `${w.t}-${f.id}-${b}`, rect, color: colorOf(w.actor), alpha });
				}
			}
			continue;
		}
		const rect = ctx.blockScreen(w.frame, w.block);
		if (rect !== undefined) out.push({ key: `${w.t}-${w.frame}`, rect, color: colorOf(w.actor), alpha });
	}
	return out;
}

export function Plates({ ctx }: { ctx: Ctx }) {
	return (
		<>
			{plates(ctx).map((p) => (
				<div
					key={p.key}
					className="absolute rounded-[3px]"
					style={{ left: p.rect.x, top: p.rect.y, width: p.rect.w, height: p.rect.h, background: p.color, opacity: p.alpha * 2.2, mixBlendMode: "multiply" }}
				/>
			))}
		</>
	);
}

/** four corner marks around a frame, the shipped hand's sign for a screenshot */
export function Corners({ rect, color, k }: { rect: Rect; color: string; k: number }) {
	const len = Math.max(6, Math.min(16, rect.w * 0.06));
	const off = 5 * k;
	const box = { x: rect.x - off, y: rect.y - off, w: rect.w + off * 2, h: rect.h + off * 2 };
	const d = [
		`M${box.x} ${box.y + len}V${box.y}H${box.x + len}`,
		`M${box.x + box.w - len} ${box.y}H${box.x + box.w}V${box.y + len}`,
		`M${box.x + box.w} ${box.y + box.h - len}V${box.y + box.h}H${box.x + box.w - len}`,
		`M${box.x + len} ${box.y + box.h}H${box.x}V${box.y + box.h - len}`,
	].join("");
	return (
		<svg className="absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden="true" style={{ opacity: k }}>
			<path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
		</svg>
	);
}

export function fmtPx(n: number): string {
	return `${Math.round(n / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
