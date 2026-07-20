// Prototype chrome, not part of the design being judged: floating variant switcher.
// [ and ] cycle variants (arrow keys are reserved — they nudge shapes on a canvas).

import { clsx } from "clsx";
import { useEffect } from "react";

export type VariantId = "tldraw" | "home";

export const variants: Record<VariantId, string> = {
	tldraw: "tldraw — custom chrome",
	home: "home-built — DOM canvas",
};

const order: VariantId[] = ["tldraw", "home"];

function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function Switcher({
	variant,
	onVariant,
	checklistOpen,
	onToggleChecklist,
}: {
	variant: VariantId;
	onVariant: (v: VariantId) => void;
	checklistOpen: boolean;
	onToggleChecklist: () => void;
}) {
	const cycle = (dir: 1 | -1) => {
		const i = order.indexOf(variant);
		const next = order[(i + dir + order.length) % order.length];
		if (next) onVariant(next);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTyping(e.target)) return;
			if (e.key === "[") cycle(-1);
			if (e.key === "]") cycle(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	return (
		<div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 py-1.5 pr-2 pl-1.5 text-white shadow-lg">
			<button
				type="button"
				onClick={() => cycle(-1)}
				className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[13px] text-neutral-400 hover:bg-neutral-700 hover:text-white"
			>
				←
			</button>
			<div className="w-56 text-center text-[12.5px] font-medium tracking-tight">
				{variants[variant]}
				<span className="ml-1.5 text-[10.5px] text-neutral-500">[ ]</span>
			</div>
			<button
				type="button"
				onClick={() => cycle(1)}
				className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[13px] text-neutral-400 hover:bg-neutral-700 hover:text-white"
			>
				→
			</button>
			<div className="mx-1 h-4 w-px bg-neutral-700" />
			<button
				type="button"
				onClick={onToggleChecklist}
				className={clsx(
					"cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium",
					checklistOpen ? "bg-white text-neutral-900" : "text-neutral-300 hover:bg-neutral-700",
				)}
			>
				checklist
			</button>
		</div>
	);
}
