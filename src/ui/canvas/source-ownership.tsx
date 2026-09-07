import { useEffect, useState } from "react";
import type { SourceDescription, SourceUse } from "../../source-edit";
import { FAINT, VALUE } from "./properties-fields";

export interface OwnershipActions {
	describe(frame: string, selector: string): Promise<SourceDescription | undefined>;
	highlight(uses: SourceUse[]): void;
	reveal(frame: string, use?: SourceUse): void;
}
export function SourceOwnership({
	frame,
	selector,
	name,
	revision,
	actions,
}: {
	frame: string;
	selector: string;
	name: string;
	revision: number;
	actions: OwnershipActions;
}) {
	const [description, setDescription] = useState<SourceDescription>();
	const [open, setOpen] = useState(false);
	const { describe, highlight, reveal } = actions;
	// biome-ignore lint/correctness/useExhaustiveDependencies(revision): refresh disclosure after acknowledged source changes.
	useEffect(() => {
		let live = true;
		void describe(frame, selector).then((value) => {
			if (live) setDescription(value);
		});
		return () => {
			live = false;
		};
	}, [describe, frame, selector, revision]);
	useEffect(() => () => highlight([]), [highlight]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
				highlight([]);
			}
		};
		addEventListener("keydown", onKey);
		return () => removeEventListener("keydown", onKey);
	}, [highlight]);
	if (!description) return null;
	const reach = description.reach;
	const uses = reach?.uses ?? [];
	const shared =
		description.scope === "definition" && (!description.source.startsWith(`frames/${frame}/`) || uses.length > 1);
	const label = shared ? "shared definition" : description.repeated ? "repeated call site" : "this use";
	return (
		<div data-source-ownership="" className="shrink-0 border-border border-b">
			<div className="flex min-h-9 items-center gap-2 px-2.5">
				<strong className="min-w-0 truncate text-sm font-medium">{name}</strong>
				<button
					type="button"
					aria-label="Show affected uses"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
					onPointerEnter={() => highlight(uses)}
					onPointerLeave={() => highlight([])}
					className={`ml-auto inline-flex items-center gap-[5px] rounded px-1 py-[3px] text-muted hover:bg-surface hover:text-text ${FAINT}`}
				>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 text-thread">
						<path d="m8 2 6 6-6 6-6-6Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
					</svg>
					<span>
						{uses.length}
						{reach?.unknown.length ? "+" : ""}
					</span>
					<svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 ${open ? "rotate-180" : ""}`}>
						<path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" />
					</svg>
				</button>
			</div>
			<div className={`px-2.5 pb-1 ${FAINT}`}>{label}</div>
			{open && (
				<div data-source-uses="" className="px-3 pt-1 pb-2.5">
					<p className={`break-all pt-1 pb-[7px] ${FAINT}`}>{description.source}</p>
					<p className={`pb-1 ${FAINT}`}>
						{uses.filter((use) => use.visible).length} visible · {uses.filter((use) => !use.visible).length}{" "}
						off-screen
					</p>
					{uses.map((use) => (
						<button
							type="button"
							key={`${use.frame}:${use.original.occurrence}`}
							onClick={() => {
								highlight([]);
								reveal(use.frame, use);
							}}
							onPointerEnter={() => highlight([use])}
							onPointerLeave={() => highlight([])}
							className={`flex w-full justify-between rounded-[3px] px-[5px] py-[7px] hover:bg-surface ${VALUE}`}
						>
							<span>{use.frame}</span>
							<span className={FAINT}>
								{use.frame === frame && use.original.occurrence === description.original.occurrence
									? "selected"
									: use.visible
										? "visible"
										: "reveal ↗"}
							</span>
						</button>
					))}
					{(reach?.unmounted ?? []).map((frame) => (
						<button
							type="button"
							key={frame}
							onClick={() => reveal(frame)}
							className={`flex w-full justify-between rounded-[3px] px-[5px] py-[7px] hover:bg-surface ${VALUE}`}
						>
							<span>{frame}</span>
							<span className={FAINT}>not mounted ↗</span>
						</button>
					))}
					{!!reach?.unmounted.length && (
						<p className={FAINT}>
							{reach.unmounted.length} unmounted source-dependent{" "}
							{reach.unmounted.length === 1 ? "frame" : "frames"}
						</p>
					)}
					{!!reach?.unknown.length && <p className={FAINT}>Unknown coverage: {reach.unknown.join(", ")}</p>}
				</div>
			)}
		</div>
	);
}
