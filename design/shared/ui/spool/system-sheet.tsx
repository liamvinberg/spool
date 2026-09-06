// The system pages' own paper: a title, ruled sections, and a caption scale.
// Nothing here is app chrome; it is the surface the chrome is laid out on.

import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";

/** the caption scale these pages use for anything the machine would print */
export const MONO = "text-muted type-detail";
/** a name in the same mono, at full ink */
export const NAME = "text-text type-value";

export function Sheet({ title, says, children }: { title: string; says: string; children: ReactNode }) {
	return (
		<div className="min-h-full w-full bg-bg px-16 py-14 font-sans text-text antialiased [font-synthesis:none]">
			<header className="flex max-w-[720px] flex-col gap-2 pb-3">
				<h1 className="font-semibold tracking-tight type-heading">{title}</h1>
				<p className="text-muted type-control">{says}</p>
			</header>
			<div className="flex flex-col">{children}</div>
		</div>
	);
}

/** One ruled band: a heading, an optional line under it, and whatever it holds. */
export function Section({
	name,
	says,
	children,
	tight = false,
}: {
	name: string;
	says?: string | undefined;
	children: ReactNode;
	/** a band whose contents carry their own rhythm */
	tight?: boolean;
}) {
	return (
		<section className="border-border border-t pt-7 pb-11">
			<div className="flex max-w-[720px] flex-col gap-1.5 pb-6">
				<h2 className="font-medium type-title">{name}</h2>
				{says === undefined ? null : <p className="text-muted type-control">{says}</p>}
			</div>
			<div className={cn("flex flex-col", tight ? "gap-3" : "gap-7")}>{children}</div>
		</section>
	);
}

/**
 * A specimen and its caption. The caption is under the thing rather than over
 * it, so the eye lands on the specimen first and reads the name second.
 */
export function Spec({
	name,
	says,
	children,
	width,
	align = "start",
}: {
	name: string;
	says?: string | undefined;
	children: ReactNode;
	width?: number | undefined;
	align?: "start" | "center" | undefined;
}) {
	return (
		<div className="flex flex-col gap-2.5" style={width === undefined ? undefined : { width }}>
			<div
				className={cn(
					"relative flex min-h-[52px] items-center rounded-md border border-border bg-canvas px-4 py-4",
					align === "center" && "justify-center",
				)}
			>
				{children}
			</div>
			<div className="flex flex-col gap-1">
				<span className={NAME}>{name}</span>
				{says === undefined ? null : <span className={cn("min-w-0", MONO)}>{says}</span>}
			</div>
		</div>
	);
}

/** A row of specimens that reads left to right: the states one component has. */
export function Across({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-end gap-x-6 gap-y-7">{children}</div>;
}

/**
 * A component the system knows about and has nothing to show for. It is drawn
 * rather than left out, because a gap you can see is a list of work and a
 * component quietly missing is not.
 */
export function Gap({ name, says }: { name: string; says: string }) {
	return (
		<div className="flex flex-col gap-2.5" style={{ width: 232 }}>
			<div className="flex min-h-[52px] items-center rounded-md border border-border border-dashed px-4 py-4">
				<span className="text-muted type-detail">no specimen</span>
			</div>
			<div className="flex flex-col gap-1">
				<span className={cn(NAME, "text-muted")}>{name}</span>
				<span className={cn("min-w-0", MONO, "text-muted")}>{says}</span>
			</div>
		</div>
	);
}
