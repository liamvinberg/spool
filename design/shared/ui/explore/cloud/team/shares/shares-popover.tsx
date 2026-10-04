import type { Share } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { ChevronIcon } from "shared/ui/spool/icons";
import { ADDED, APP_SHARES, Caption, Faces, KindGlyph, madeBy, Outsider, PagesRail, ProjectCanvas, RAIL_W, type Who } from "./parts";

/**
 * Take one, the winner of round one (2026, Liam): sharing stays on the canvas,
 * and the canvas gains one control for the whole project. Its popover is one
 * quiet row per share: what kind, who, which pages. Everything else (who made
 * it, how often it was opened, adding, removing, stopping) waits behind the
 * row, which opens in place, the way the shipped popover keeps its verbs under
 * the link.
 *
 * It bets that people look for sharing where they made it. A viewer finds the
 * same control in the browser canvas and gets the rows alone, no way to open them.
 */

export type PopoverState = "base" | "manage" | "viewer";

export function SharesPopover({ state = "base", onManage, onBack }: { state?: PopoverState; onManage?: () => void; onBack?: () => void }) {
	const who: Who = state === "viewer" ? "lena" : "mira";
	return (
		<div className="relative h-full">
			<ProjectCanvas
				who={who}
				page="checkout"
				rail={<PagesRail who={who} page="checkout" />}
				corner={
					<>
						<Faces ids={who === "lena" ? ["jonas", "mira", "ada"] : ["jonas", "ada"]} />
						<button type="button" aria-expanded className="flex h-8 items-center gap-2 rounded-md border border-muted bg-raised px-3 text-text type-control">
							Shared
							<span className="text-muted type-detail">{APP_SHARES.length}</span>
						</button>
					</>
				}
			>
				<section role="dialog" aria-label="Shared" className="absolute top-[60px] right-4 z-30 w-[344px] animate-menu-in overflow-hidden rounded-md border border-border-raised bg-raised py-1">
					{APP_SHARES.map((share) =>
						state === "manage" && share.kind === "people" ? (
							<Opened key={share.kind} share={share} who={who} onClose={onBack} />
						) : (
							<ShareRow key={share.kind} share={share} who={who} onOpen={share.kind === "people" ? onManage : undefined} />
						),
					)}
				</section>
			</ProjectCanvas>
			<Caption left={RAIL_W + 24}>
				{state === "manage"
					? "Popover, checkout's share opened. Its people, and the one way to end it."
					: state === "viewer"
						? "Popover, as a viewer in the browser. The rows alone."
						: "Popover. One control on the canvas, one row per share."}
			</Caption>
		</div>
	);
}

/** "kim and ola", or "anyone with the link": the first part of each address, which is how people say them */
function whoOf(share: Share) {
	if (share.kind === "link") return "anyone with the link";
	const names = (share.people ?? []).map((email) => email.split(/[.@]/u)[0] ?? email);
	return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function ShareRow({ share, who, onOpen }: { share: Share; who: Who; onOpen?: (() => void) | undefined }) {
	const editor = who === "mira";
	return (
		<button
			type="button"
			disabled={!editor}
			onClick={onOpen}
			className={cn("flex h-10 w-full items-center gap-2.5 px-3.5 text-left", editor && "cursor-pointer hover:bg-surface/60")}
		>
			<KindGlyph kind={share.kind} className="shrink-0 text-muted" />
			<span className="shrink-0 text-text type-label">{whoOf(share)}</span>
			<span className="min-w-0 flex-1 truncate text-muted type-detail">{share.pages.join(", ")}</span>
			{editor ? <ChevronIcon className="h-2.5 w-2.5 shrink-0 text-muted" /> : null}
		</button>
	);
}

/** One share opened in place: its people, add and remove, and the way to end it. */
function Opened({ share, who, onClose }: { share: Share; who: Who; onClose?: (() => void) | undefined }) {
	return (
		<div className="bg-surface/60">
			<button type="button" onClick={onClose} className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left">
				<KindGlyph kind={share.kind} className="shrink-0 text-text" />
				<span className="shrink-0 text-text type-label">{whoOf(share)}</span>
				<span className="min-w-0 flex-1 truncate text-muted type-detail">{share.pages.join(", ")}</span>
				<ChevronIcon open className="h-2.5 w-2.5 shrink-0 text-muted" />
			</button>
			<ul className="flex flex-col px-3.5">
				{(share.people ?? []).map((email) => (
					<li key={email} className="flex h-7 items-center gap-2 text-text type-detail">
						<Outsider email={email} size={18} />
						<span className="min-w-0 flex-1 truncate">{email}</span>
						<button type="button" aria-label={`Remove ${email}`} className="cursor-pointer text-muted hover:text-text">
							×
						</button>
					</li>
				))}
			</ul>
			<div className="px-3.5 pt-1.5 pb-2">
				<div className="flex h-7 items-center gap-1 rounded-sm border border-muted bg-bg px-2">
					<span className="text-text type-detail">{ADDED}</span>
					<span className="h-3.5 w-px animate-pulse bg-text" />
				</div>
			</div>
			<div className="flex h-9 items-center justify-between border-border-raised border-t px-3.5">
				<span className="text-muted type-detail">
					{madeBy(share, who)} · {share.opens} opens
				</span>
				<button type="button" className="cursor-pointer text-muted type-label transition-colors hover:text-thread">
					Stop sharing
				</button>
			</div>
			<p className="px-3.5 pb-2.5 text-muted type-caption">Their access stops at once.</p>
		</div>
	);
}
