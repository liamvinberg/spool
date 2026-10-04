import type { Share } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { CheckIcon } from "shared/ui/spool/icons";
import {
	ADDED,
	AddressField,
	APP_SHARES,
	Caption,
	Faces,
	KindGlyph,
	LINK_URL,
	madeBy,
	Outsider,
	PagesRail,
	Pages,
	ProjectCanvas,
	RAIL_W,
	SmallButton,
	TextButton,
	type Who,
} from "./parts";

/**
 * Take one, the smallest diff: sharing stays where it ships, on the canvas,
 * and the canvas gains one control for the whole project. The shipped popover
 * is about the frame you right-clicked; this one is about every page of the
 * project that anyone outside Tidemark can open, who made each share, and how
 * often it has been opened. Each share is edited or stopped in place, the way
 * the shipped popover already stops a link.
 *
 * It bets that people look for sharing where they made it. A viewer finds the
 * same control in the browser canvas and reads the same list without the verbs.
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
				<Popover who={who} adding={state === "manage"} onManage={onManage} onBack={onBack} />
			</ProjectCanvas>
			<Caption left={RAIL_W + 24}>
				{state === "manage"
					? "Popover, adding someone to checkout. They sign in with that address and see checkout and nothing else."
					: state === "viewer"
						? "Popover, as a viewer in the browser. Lena reads the same list, and nothing in it is a button."
						: "Popover. One control on the canvas lists every share of the project, the same popover a link already opens."}
			</Caption>
		</div>
	);
}

function Popover({ who, adding, onManage, onBack }: { who: Who; adding: boolean; onManage?: (() => void) | undefined; onBack?: (() => void) | undefined }) {
	const editor = who === "mira";
	return (
		<section role="dialog" aria-label="Shared from tidemark app" className="absolute top-[60px] right-4 z-30 w-[380px] animate-menu-in overflow-hidden rounded-md border border-border-raised bg-raised">
			<header className="flex flex-col gap-1 px-4 pt-3.5 pb-3">
				<div className="flex items-baseline justify-between">
					<h2 className="text-text type-title">Shared from tidemark app</h2>
					<span className="text-muted type-detail">3 pages</span>
				</div>
				<p className="text-muted type-caption">
					{editor
						? "These belong to Tidemark. Any editor or admin can change or stop one, whoever made it."
						: "These belong to Tidemark. Editors and admins can change them."}
				</p>
			</header>
			{APP_SHARES.map((share) => (
				<ShareBlock key={share.kind} share={share} who={who} adding={adding && share.kind === "people"} onManage={onManage} onBack={onBack} />
			))}
			{editor ? (
				<footer className="flex h-10 items-center justify-between border-border-raised border-t px-4">
					<span className="text-muted type-caption">Right-click a page to share it.</span>
					<TextButton>Share a page…</TextButton>
				</footer>
			) : null}
		</section>
	);
}

function ShareBlock({
	share,
	who,
	adding,
	onManage,
	onBack,
}: {
	share: Share;
	who: Who;
	adding: boolean;
	onManage?: (() => void) | undefined;
	onBack?: (() => void) | undefined;
}) {
	const editor = who === "mira";
	const people = share.people ?? [];
	return (
		<div className={cn("flex flex-col gap-2.5 border-border-raised border-t px-4 py-3", adding && "bg-surface/60")}>
			<div className="flex items-center gap-2">
				<KindGlyph kind={share.kind} className="text-muted" />
				<span className="flex-1 text-text type-label">{share.kind === "people" ? "Invited people" : "Anyone with the link"}</span>
				<span className="text-muted type-detail">{share.opens} opens</span>
			</div>
			<Pages names={share.pages} />
			{share.kind === "people" ? (
				adding ? (
					<div className="flex flex-col gap-2">
						<AddressField emails={[...people, ADDED]} />
						<p className="text-muted type-caption">They sign in with that address to open checkout.</p>
					</div>
				) : (
					<ul className="flex flex-col gap-1.5">
						{people.map((email) => (
							<li key={email} className="flex items-center gap-2 text-text type-detail">
								<Outsider email={email} size={18} />
								{email}
							</li>
						))}
					</ul>
				)
			) : editor ? (
				<div className="flex h-8 items-center overflow-hidden rounded-sm border border-border-raised bg-surface pl-2.5">
					<span className="min-w-0 flex-1 truncate text-text type-detail">{LINK_URL}</span>
					<span className="flex h-full w-[64px] items-center justify-center border-border-raised border-l text-text type-label">Copy</span>
				</div>
			) : (
				<p className="text-muted type-caption">Anyone who has it can open these two pages without signing in.</p>
			)}
			<div className="flex items-center justify-between">
				<span className="text-muted type-detail">{madeBy(share, who)}</span>
				{!editor ? null : adding ? (
					<span className="flex gap-1.5">
						<SmallButton onClick={onBack}>Cancel</SmallButton>
						<SmallButton primary onClick={onBack}>
							<span className="flex items-center gap-1">
								<CheckIcon className="h-2.5 w-2.5" />
								Add
							</span>
						</SmallButton>
					</span>
				) : (
					<span className="flex gap-4">
						<TextButton onClick={share.kind === "people" ? onManage : undefined}>{share.kind === "people" ? "Add someone" : "Edit"}</TextButton>
						<TextButton danger>{share.kind === "link" ? "Stop link" : "Stop"}</TextButton>
					</span>
				)}
			</div>
		</div>
	);
}
