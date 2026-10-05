import { cn } from "shared/lib/utils";
import { ChevronIcon } from "shared/ui/spool/icons";

/**
 * Sharing pages with outsiders (DEV-193), as `src/ui/shares.tsx` and `src/ui/canvas/share-sheet.tsx` draw it: the
 * Shared control at the window's top right with its popover, one row per share, a row opened in place for whoever
 * may change it, and the sheet a share starts from on a page's right-click.
 */

export interface ShownShare {
	kind: "people" | "link";
	pages: string[];
	people: string[];
	by: string;
	when: string;
	opens: number;
}

function personName(email: string): string {
	return email.split(/[.@]/u)[0] || email;
}

function saidList(names: readonly string[]): string {
	if (names.length <= 2) return names.join(" and ");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "kim and ola", or "anyone with the link". */
export function shareWho(share: Pick<ShownShare, "kind" | "people">): string {
	return share.kind === "link" ? "anyone with the link" : saidList(share.people.map(personName));
}

export function SharedButton({ count, open = false }: { count: number; open?: boolean }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			className="flex h-7 items-center gap-2 rounded-sm border border-border-raised bg-bg px-2.5 text-text transition-colors hover:bg-surface type-control"
		>
			Shared
			<span className="text-muted type-detail">{count}</span>
		</button>
	);
}

/** The popover: one row per share, and the one opened in place when there is one. */
export function SharedPopover({
	shares,
	manage,
	opened,
	adding = "",
}: {
	shares: readonly ShownShare[];
	manage: boolean;
	/** which row stands open, by its place in the list */
	opened?: number | undefined;
	adding?: string;
}) {
	return (
		<section
			role="dialog"
			aria-label="Shared"
			className="w-[344px] overflow-hidden rounded-md border border-border-raised bg-raised py-1"
		>
			{shares.map((share, index) =>
				manage && opened === index ? (
					<OpenedShare key={share.pages.join()} share={share} adding={adding} />
				) : (
					<ShareRow key={share.pages.join()} share={share} manage={manage} />
				),
			)}
		</section>
	);
}

function ShareRow({ share, manage }: { share: ShownShare; manage: boolean }) {
	return (
		<button
			type="button"
			disabled={!manage}
			className={cn("flex h-10 w-full items-center gap-2.5 px-3.5 text-left", manage && "cursor-pointer hover:bg-surface/60")}
		>
			<KindGlyph kind={share.kind} className="shrink-0 text-muted" />
			<span className="shrink-0 text-text type-label">{shareWho(share)}</span>
			<span className="min-w-0 flex-1 truncate text-muted type-detail">{share.pages.join(", ")}</span>
			{manage && <ChevronIcon className="h-2.5 w-2.5 shrink-0 text-muted" />}
		</button>
	);
}

function OpenedShare({ share, adding }: { share: ShownShare; adding: string }) {
	return (
		<div className="bg-surface/60">
			<button type="button" className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left">
				<KindGlyph kind={share.kind} className="shrink-0 text-text" />
				<span className="shrink-0 text-text type-label">{shareWho(share)}</span>
				<span className="min-w-0 flex-1 truncate text-muted type-detail">{share.pages.join(", ")}</span>
				<ChevronIcon open className="h-2.5 w-2.5 shrink-0 text-muted" />
			</button>
			{share.kind === "people" && (
				<>
					<ul className="flex flex-col px-3.5">
						{share.people.map((email) => (
							<li key={email} className="flex h-7 items-center gap-2 text-text type-detail">
								<span className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-border-raised bg-surface text-[8px] text-muted">
									{email[0]?.toUpperCase()}
								</span>
								<span className="min-w-0 flex-1 truncate">{email}</span>
								<button type="button" aria-label={`Remove ${email}`} className="cursor-pointer px-1 text-muted hover:text-text">
									×
								</button>
							</li>
						))}
					</ul>
					<div className="px-3.5 pt-1.5 pb-2">
						<div className="flex h-7 items-center rounded-sm border border-muted bg-bg px-2 type-detail">
							{adding === "" ? <span className="text-muted">Add someone by email</span> : <span className="text-text">{adding}</span>}
						</div>
					</div>
				</>
			)}
			<p className="truncate border-border-raised border-t px-3.5 pt-2 text-muted type-detail">
				{personName(share.by)} · {share.when} · {share.opens} opens
			</p>
			<div className="flex h-8 items-center justify-between px-3.5">
				<button type="button" className="cursor-pointer text-muted hover:text-text type-label">
					Copy link
				</button>
				<button type="button" className="cursor-pointer text-muted hover:text-thread type-label">
					Stop sharing
				</button>
			</div>
			<p className="px-3.5 pb-2.5 text-muted type-caption">Their access stops at once.</p>
		</div>
	);
}

/** The sheet a share starts from: who it is for, its pages, and the links that leave them, said and never blocking. */
export function ShareSheetCard({
	pages,
	chosen,
	people,
	leaving,
}: {
	pages: readonly string[];
	chosen: readonly string[];
	people: string;
	leaving: readonly { from: string; to: string; page: string }[];
}) {
	return (
		<div
			role="dialog"
			aria-label={`Share ${chosen.join(", ")}`}
			className="flex w-[420px] flex-col rounded-lg border border-border-raised bg-raised"
		>
			<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
				<h2 className="font-medium type-title">Share {chosen.join(", ")}</h2>
				<span className="text-muted">×</span>
			</div>
			<div className="flex gap-2 border-border-raised border-b px-5 py-3">
				{(["people", "link"] as const).map((kind) => (
					<span
						key={kind}
						className={cn(
							"flex h-8 flex-1 items-center justify-center gap-2 rounded-sm border type-control",
							kind === "people" ? "border-thread bg-surface text-text" : "border-border-raised text-muted",
						)}
					>
						<KindGlyph kind={kind} />
						{kind === "people" ? "Named people" : "Anyone with the link"}
					</span>
				))}
			</div>
			<div className="flex flex-col gap-1.5 border-border-raised border-b px-5 py-3">
				<span className="text-muted type-label">They sign in with one of these addresses to see it</span>
				<div className="flex h-8 items-center rounded-sm border border-text bg-bg px-2 text-text type-detail">{people}</div>
			</div>
			<div className="border-border-raised border-b px-5 py-3">
				{pages.map((page) => (
					<label key={page} className="flex h-7 items-center gap-2 type-detail">
						<input type="checkbox" readOnly checked={chosen.includes(page)} className="accent-thread" />
						<span className={chosen.includes(page) ? "text-text" : "text-muted"}>{page}</span>
					</label>
				))}
			</div>
			{leaving.length > 0 && (
				<div className="flex flex-col gap-1 border-border-raised border-b px-5 py-3">
					<p className="text-muted type-label">
						{leaving.length === 1 ? "A link leaves" : `${leaving.length} links leave`} these pages. Whoever follows one sees it isn’t shared
						with them.
					</p>
					{leaving.map((link) => (
						<p key={`${link.from}-${link.to}`} className="flex items-center gap-2 text-text type-detail">
							<span className="min-w-0 flex-1 truncate">
								{link.from} → {link.to}
								<span className="text-muted"> on {link.page}</span>
							</span>
							<span className="shrink-0 text-muted type-label">Add {link.page}</span>
						</p>
					))}
				</div>
			)}
			<div className="flex items-center justify-end gap-3 px-5 py-3">
				<span className="text-muted type-control">Cancel</span>
				<span className="flex h-8 items-center rounded-sm bg-text px-3 text-bg type-control">Share</span>
			</div>
		</div>
	);
}

export function KindGlyph({ kind, className }: { kind: ShownShare["kind"]; className?: string | undefined }) {
	return kind === "people" ? (
		<svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
			<circle cx="6" cy="5.5" r="2.3" />
			<path d="M1.8 13c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6" strokeLinecap="round" />
			<path d="M10.4 3.4a2.3 2.3 0 0 1 0 4.3M12 9.7c1.2.5 2 1.6 2.3 3.3" strokeLinecap="round" />
		</svg>
	) : (
		<svg viewBox="0 0 16 16" className={cn("h-3.5 w-3.5", className)} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
			<path d="M7 9a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
			<path d="M9 7a2.6 2.6 0 0 0-3.7 0L3.1 9.2a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
		</svg>
	);
}
