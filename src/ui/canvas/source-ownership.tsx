import { useEffect, useRef, useState } from "react";
import type { SourceDescription, SourceOperation, SourceUse } from "../../source-edit";
import { FAINT, VALUE } from "./properties-fields";

function ownershipLabel(description: SourceDescription, frame: string): string {
	const multiple = (description.reach?.uses.length ?? 0) > 1 || !!description.reach?.unmounted.length;
	if (description.scope === "definition" && (!description.source.startsWith(`frames/${frame}/`) || multiple))
		return "shared definition";
	return description.repeated || multiple ? "repeated call site" : "this use";
}

export interface OwnershipActions {
	active?:
		| { frame: string; selector: string; generation: number; field: string | undefined; operation: SourceOperation }
		| undefined;
	describe(
		frame: string,
		selector: string,
		field?: string,
		operation?: SourceOperation,
	): Promise<SourceDescription | undefined>;
	release(): void;
	highlight(uses: SourceUse[]): void;
	reveal(frame: string, use?: SourceUse): void;
}
export function SourceOwnership({
	frame,
	selector,
	name,
	revision,
	field,
	operation,
	generation,
	actions,
	onSupport,
}: {
	frame: string;
	selector: string;
	name: string;
	revision: number;
	field?: string | undefined;
	operation?: SourceOperation | undefined;
	generation?: number | undefined;
	actions: OwnershipActions;
	onSupport(value: { identity: string; label: string } | undefined, field?: string): void;
}) {
	const [described, setDescribed] = useState<{ identity: string; value: SourceDescription | undefined }>();
	const identity = JSON.stringify([frame, selector, field, operation, generation, revision]);
	const pending = described?.identity !== identity;
	const description = !pending ? described?.value : undefined;
	const [open, setOpen] = useState(false);
	const panelHeight = useRef(0);
	const { describe, highlight, reveal, release } = actions;
	// biome-ignore lint/correctness/useExhaustiveDependencies(revision): refresh disclosure after acknowledged source changes.
	useEffect(() => {
		let live = true;
		highlight([]);
		onSupport(undefined, field);
		void describe(frame, selector, field, operation).then((value) => {
			if (live) {
				setDescribed({ identity, value });
				onSupport(
					value ? { identity: `${frame} ${selector}`, label: ownershipLabel(value, frame) } : undefined,
					field,
				);
			}
		});
		return () => {
			live = false;
		};
	}, [describe, frame, selector, field, operation, identity, revision, onSupport, highlight]);
	useEffect(() => () => highlight([]), [highlight]);
	useEffect(() => () => release(), [release]);
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
	const otherUses =
		description?.reach?.uses.filter(
			(use) => !(use.frame === frame && use.original.occurrence === description.original.occurrence),
		) ?? [];
	useEffect(() => {
		if (open)
			highlight(
				description?.reach?.uses.filter(
					(use) => !(use.frame === frame && use.original.occurrence === description.original.occurrence),
				) ?? [],
			);
	}, [open, description, frame, highlight]);
	if (!description && !pending) return null;
	const reach = description?.reach;
	const uses = reach?.uses ?? [];
	const label = description ? ownershipLabel(description, frame) : undefined;
	return (
		<div data-source-ownership="" className="shrink-0 border-border border-b">
			<div className="flex min-h-[42px] items-center gap-2 px-3 py-2">
				<strong className="min-w-0 truncate type-title">{name}</strong>
				{description && (
					<button
						type="button"
						aria-label="Show affected uses"
						title={label}
						aria-expanded={open}
						onClick={() => setOpen(!open)}
						onPointerEnter={() => highlight(otherUses)}
						onPointerLeave={() => highlight(open ? otherUses : [])}
						className={`inline-flex min-h-6 items-center gap-[5px] rounded px-1 py-[3px] text-muted hover:bg-surface hover:text-text ${FAINT}`}
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
				)}
			</div>

			{open && pending && <div aria-hidden="true" style={{ height: panelHeight.current }} />}
			{open && description && (
				<div
					data-source-uses=""
					className="px-3 pt-1 pb-2.5"
					ref={(element) => {
						if (element) panelHeight.current = element.getBoundingClientRect().height;
					}}
				>
					<p className={`break-all pt-1 pb-[7px] ${FAINT}`}>
						{label} · {description.source}
					</p>
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
							onPointerEnter={() =>
								highlight(
									use.frame === frame && use.original.occurrence === description.original.occurrence
										? []
										: [use],
								)
							}
							onPointerLeave={() => highlight(open ? otherUses : [])}
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
