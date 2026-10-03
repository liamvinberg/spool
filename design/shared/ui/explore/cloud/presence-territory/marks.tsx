import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { type ActorId, colorOf, isAgent, ownerOf } from "./cast";
import type { V } from "./world";

/**
 * The marks every take shares. A person is a filled disc and a pointer; an
 * agent is a ring in its owner's colour. The register says the rest: a person's
 * name is a word in sans, an agent's is mono.
 */

export function Pointer({ at, color, children }: { at: V; color: string; children?: ReactNode }) {
	return (
		<div className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
			<svg width="16" height="18" viewBox="0 0 16 18" className="-translate-x-[2px] -translate-y-[1px] block" aria-hidden="true">
				<path d="M2 1.5v13.2l3.6-3.4 2.5 5.4 2.3-1-2.4-5.3h5Z" fill={color} stroke="#0e0e0e" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
			{children === undefined ? null : <div className="absolute top-[15px] left-[12px]">{children}</div>}
		</div>
	);
}

/** a person's name on their pointer: their colour, sentence register */
export function NameTag({ actor, children }: { actor: ActorId; children?: ReactNode }) {
	return (
		<div
			className="flex items-center gap-1.5 whitespace-nowrap rounded-xs py-px pr-1.5 pl-1.5 text-[#0e0e0e] type-caption"
			style={{ background: colorOf(actor) }}
		>
			<span className="font-medium">{ownerOf(actor).name}</span>
			{children}
		</div>
	);
}

/** your own pointer: the system arrow, which is how you know it is you */
export function YourPointer({ at }: { at: V }) {
	return (
		<div className="pointer-events-none absolute top-0 left-0 z-30" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
			<svg width="18" height="22" viewBox="0 0 18 22" className="-translate-x-[3px] -translate-y-[2px] block" aria-hidden="true">
				<path d="M3 2v15.5l4-3.8 2.8 6.1 2.6-1.1-2.7-6h5.6Z" fill="#ffffff" stroke="#0e0e0e" strokeWidth="1.3" strokeLinejoin="round" />
			</svg>
		</div>
	);
}

/** the mark for an actor: a filled disc for a person, a ring for an agent */
export function ActorMark({
	actor,
	size = 14,
	busy = false,
	className,
}: {
	actor: ActorId;
	size?: number;
	/** an agent mid-write turns its ring, the way the dock glyph does */
	busy?: boolean;
	className?: string | undefined;
}) {
	const color = colorOf(actor);
	const owner = ownerOf(actor);
	if (!isAgent(actor)) {
		return (
			<span
				className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-[#0e0e0e]", className)}
				style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.58), lineHeight: 1 }}
			>
				{owner.initial}
			</span>
		);
	}
	const r = size / 2 - 1.2;
	return (
		<span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
			<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" className="block">
				<circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="1.6" strokeOpacity={busy ? 0.3 : 1} />
				{busy ? (
					<path
						d={`M${size / 2} ${size / 2 - r}A${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2}`}
						fill="none"
						stroke={color}
						strokeWidth="1.6"
						strokeLinecap="round"
						className="origin-center animate-agent-spin"
						style={{ transformBox: "view-box" }}
					/>
				) : null}
			</svg>
			<span
				className="absolute inset-0 flex items-center justify-center font-medium"
				style={{ color, fontSize: Math.round(size * 0.5), lineHeight: 1 }}
			>
				{owner.id === "you" ? "" : owner.initial.toLowerCase()}
			</span>
		</span>
	);
}

/** an agent's name, machine register */
export function AgentTag({ actor, children, className }: { actor: ActorId; children?: ReactNode; className?: string | undefined }) {
	return (
		<span className={cn("whitespace-nowrap type-detail", className)} style={{ color: colorOf(actor) }}>
			{children}
		</span>
	);
}
