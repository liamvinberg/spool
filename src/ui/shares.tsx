import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROOT_PAGE } from "../page-path";
import {
	type ProjectShares,
	type ShareCommenter,
	type SharesSource,
	type ShareView,
	saidAgo,
	shareWho,
	TOP_PAGE,
} from "../share-view";
import { cn } from "./cn";
import { ChevronIcon } from "./icons";
import { Button } from "./primitives/actions";
import { TextAction } from "./primitives/feedback";
import { TextField } from "./primitives/inputs";
import { Popover } from "./primitives/overlays";
import { TeamActionRefused, teamSays } from "./team-source";

/** Said on the window whenever this tab changed a project's shares, so every Shared control reads them again. */
export const SHARES_CHANGED = "spool-shares-change";

/** A project's shares, read when shown, again whenever this tab changes them, and when the window comes back. */
export function useShares(source: SharesSource | null): { shares: ProjectShares | undefined; reread: () => void } {
	const [shares, setShares] = useState<ProjectShares | undefined>(undefined);
	const revision = useRef(0);
	const reread = useCallback(() => {
		if (source === null) return;
		const asked = ++revision.current;
		void source.read().then((read) => {
			if (asked === revision.current) setShares(read);
		});
	}, [source]);
	useEffect(() => {
		setShares(undefined);
		reread();
		const again = () => reread();
		const visible = () => document.visibilityState === "visible" && reread();
		window.addEventListener(SHARES_CHANGED, again);
		document.addEventListener("visibilitychange", visible);
		return () => {
			window.removeEventListener(SHARES_CHANGED, again);
			document.removeEventListener("visibilitychange", visible);
		};
	}, [reread]);
	return { shares, reread };
}

/**
 * The Shared control (DEV-158): one quiet button at the canvas's top right, and its popover, one row per share:
 * whom it is for and which pages. Whoever may change shares opens a row to its people (add, remove), who made it
 * and when, how often it was opened, its link, and Stop sharing. Everyone else sees the rows alone.
 */
export function SharedControl({ source, shares }: { source: SharesSource; shares: ProjectShares | undefined }) {
	const [open, setOpen] = useState(false);
	const [opened, setOpened] = useState<string | null>(null);
	const [said, setSaid] = useState<string | null>(null);
	/** Where the popover hangs, under the button: on the page's top layer, over whatever the window holds. */
	const [at, setAt] = useState<{ top: number; right: number } | null>(null);
	const box = useRef<HTMLDivElement | null>(null);
	const popover = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!box.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
		};
		const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
		window.addEventListener("pointerdown", away);
		window.addEventListener("keydown", key);
		return () => {
			window.removeEventListener("pointerdown", away);
			window.removeEventListener("keydown", key);
		};
	}, [open]);
	if (shares?.state !== "ready" || shares.shares.length === 0) return null;
	const changed = (refused: string | null) => {
		setSaid(refused === null ? null : refusalSaid(refused));
		window.dispatchEvent(new CustomEvent(SHARES_CHANGED));
	};
	return (
		<div ref={box} className="relative" data-shared-control="">
			<button
				type="button"
				aria-expanded={open}
				onClick={(event) => {
					const button = event.currentTarget.getBoundingClientRect();
					setAt({ top: button.bottom + 6, right: window.innerWidth - button.right });
					setOpen((was) => !was);
				}}
				className="flex h-7 items-center gap-2 rounded-sm border border-line-strong bg-surface-window px-2.5 text-primary transition-colors hover:bg-surface-panel type-control"
			>
				Shared
				<span className="text-secondary type-detail">{shares.shares.length}</span>
			</button>
			{open &&
				at !== null &&
				createPortal(
					<Popover
						ref={popover}
						aria-label="Shared"
						pad="none"
						className="fixed z-50 w-[344px] overflow-hidden py-1"
						style={at}
					>
						{shares.shares.map((share) =>
							shares.manage && opened === share.id ? (
								<OpenedShare
									key={share.id}
									share={share}
									source={source}
									onClose={() => setOpened(null)}
									onChanged={changed}
								/>
							) : (
								<ShareRow
									key={share.id}
									share={share}
									manage={shares.manage}
									onOpen={() => {
										setSaid(null);
										setOpened(share.id);
									}}
								/>
							),
						)}
						{said !== null && <p className="px-3.5 pt-1 pb-2 text-accent type-caption">{said}</p>}
					</Popover>,
					document.body,
				)}
		</div>
	);
}

function ShareRow({ share, manage, onOpen }: { share: ShareView; manage: boolean; onOpen: () => void }) {
	return (
		<button
			type="button"
			disabled={!manage}
			onClick={onOpen}
			className={cn(
				"flex h-10 w-full items-center gap-2.5 px-3.5 text-left",
				manage && "cursor-pointer hover:bg-surface-panel/60",
			)}
		>
			<KindGlyph kind={share.kind} className="shrink-0 text-secondary" />
			<span className="shrink-0 text-primary type-label">{shareWho(share)}</span>
			<span className="min-w-0 flex-1 truncate text-secondary type-detail">
				{share.pages.map((page) => (page === ROOT_PAGE ? TOP_PAGE : page)).join(", ")}
			</span>
			{manage && (
				<span className="h-2.5 w-2.5 shrink-0 text-secondary">
					<ChevronIcon />
				</span>
			)}
		</button>
	);
}

/** One share opened in place: its people, adding and removing them, its link, and the one way to end it. */
function OpenedShare({
	share,
	source,
	onClose,
	onChanged,
}: {
	share: ShareView;
	source: SharesSource;
	onClose: () => void;
	onChanged: (refused: string | null) => void;
}) {
	const [adding, setAdding] = useState("");
	const [copied, setCopied] = useState(false);
	const add = async () => {
		const people = adding
			.split(/[\s,;]+/u)
			.map((one) => one.trim())
			.filter((one) => one !== "");
		if (people.length === 0) return;
		const refused = await source.change(share.id, { add: people });
		if (refused === null) setAdding("");
		onChanged(refused);
	};
	return (
		<div className="bg-surface-panel/60" data-share-opened={share.id}>
			<button
				type="button"
				onClick={onClose}
				className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3.5 text-left"
			>
				<KindGlyph kind={share.kind} className="shrink-0 text-primary" />
				<span className="shrink-0 text-primary type-label">{shareWho(share)}</span>
				<span className="min-w-0 flex-1 truncate text-secondary type-detail">
					{share.pages.map((page) => (page === ROOT_PAGE ? TOP_PAGE : page)).join(", ")}
				</span>
				<span className="h-2.5 w-2.5 shrink-0 rotate-90 text-secondary">
					<ChevronIcon />
				</span>
			</button>
			{share.kind === "people" && (
				<>
					<ul className="flex flex-col px-3.5">
						{share.people.map((email) => (
							<li key={email} className="flex h-7 items-center gap-2 text-primary type-detail">
								<Initial email={email} />
								<span className="min-w-0 flex-1 truncate">{email}</span>
								<button
									type="button"
									aria-label={`Remove ${email}`}
									className="cursor-pointer px-1 text-secondary hover:text-primary"
									onClick={async () => onChanged(await source.change(share.id, { remove: [email] }))}
								>
									×
								</button>
							</li>
						))}
					</ul>
					<form
						className="px-3.5 pt-1.5 pb-2"
						onSubmit={(event) => {
							event.preventDefault();
							void add();
						}}
					>
						<TextField
							label="Add someone by email"
							placeholder="Add someone by email"
							value={adding}
							onValueChange={setAdding}
						/>
					</form>
				</>
			)}
			<ShareCommentersList
				share={share}
				source={source}
				manage
				onChanged={onChanged}
				className="border-line-strong border-t px-3.5 pb-1"
			/>
			<p className="truncate border-line-strong border-t px-3.5 pt-2 text-secondary type-detail">
				{share.by} · {saidAgo(share.at)} · {share.opens} {share.opens === 1 ? "open" : "opens"}
			</p>
			<div className="flex h-8 items-center justify-between px-3.5">
				{share.link === undefined ? (
					<span />
				) : (
					<button
						type="button"
						className="cursor-pointer text-secondary transition-colors hover:text-primary type-label"
						onClick={() => {
							void navigator.clipboard?.writeText(share.link ?? "").then(() => setCopied(true));
						}}
					>
						{copied ? "Copied" : "Copy link"}
					</button>
				)}
				<button
					type="button"
					className="cursor-pointer text-secondary transition-colors hover:text-accent type-label"
					onClick={async () => {
						onClose();
						onChanged(await source.stop(share.id));
					}}
				>
					Stop sharing
				</button>
			</div>
			<p className="px-3.5 pb-2.5 text-secondary type-caption">Their access stops at once.</p>
		</div>
	);
}

/**
 * Who has commented through a share (spool#174), each with how much of theirs stands there, and Block for whoever
 * changes shares: what they wrote through the share goes, and they write there no more. Nothing when nobody has, or
 * where shares have no comments (a solo project's).
 */
export function ShareCommentersList({
	share,
	source,
	manage,
	onChanged,
	className,
}: {
	share: ShareView;
	source: SharesSource;
	manage: boolean;
	onChanged: (refused: string | null) => void;
	className?: string | undefined;
}) {
	const [commenters, setCommenters] = useState<ShareCommenter[] | null>(null);
	const [asking, setAsking] = useState<string | null>(null);
	const [revision, setRevision] = useState(0);
	// read again after each Block, which `revision` counts
	useEffect(() => {
		let live = true;
		if (revision >= 0)
			void source.commenters?.(share.id).then((read) => {
				if (live) setCommenters(read);
			});
		return () => {
			live = false;
		};
	}, [source, share.id, revision]);
	if (source.commenters === undefined || commenters === null || commenters.length === 0) return null;
	const block = async (account: string) => {
		setAsking(null);
		const refused = (await source.block?.(share.id, account)) ?? "unavailable";
		onChanged(refused);
		setRevision((was) => was + 1);
	};
	return (
		<div className={cn("flex flex-col", className)} data-share-commenters={share.id}>
			<p className="flex h-7 items-center text-secondary type-detail">Commented through this share</p>
			<ul className="flex flex-col">
				{commenters.map((one) => (
					<li key={one.account} className="flex flex-col" data-share-commenter={one.account}>
						<div className="flex h-7 items-center gap-2 type-detail">
							<span className="min-w-0 flex-1 truncate text-primary">{one.name}</span>
							{one.blocked ? (
								<span className="shrink-0 text-tertiary">blocked</span>
							) : (
								<>
									<span className="shrink-0 text-secondary">
										{one.posts} {one.posts === 1 ? "comment" : "comments"} · {saidAgo(one.last)}
									</span>
									{manage && (
										<TextAction
											className="-mr-1.5"
											aria-expanded={asking === one.account}
											onClick={() => setAsking(asking === one.account ? null : one.account)}
										>
											Block
										</TextAction>
									)}
								</>
							)}
						</div>
						{asking === one.account && (
							<div className="flex items-center gap-2 pb-1.5">
								<span className="min-w-0 flex-1 text-secondary type-label">
									What they wrote here goes, and they can't comment through this share again.
								</span>
								<Button size="sm" variant="danger" onClick={() => void block(one.account)}>
									Block
								</Button>
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

/** How a refusal from spool.page is said under the popover. */
export function refusalSaid(code: string): string {
	switch (code) {
		case "invalid_mailbox":
			return "That isn't an email address.";
		case "too_many_people":
			return "A share names 50 people at most.";
		case "signed_out":
			return "Sign in to spool.page first.";
		case "editor_required":
			return "Only editors and admins change shares.";
		case "share_not_found":
			return "That share was stopped meanwhile.";
		default:
			// a team's own refusals, such as a team gone local, in Home's words
			return teamSays(new TeamActionRefused(code), "spool.page couldn't do that just now.");
	}
}

function Initial({ email }: { email: string }) {
	return (
		<span className="inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-line-strong bg-surface-panel text-[8px] text-secondary">
			{email[0]?.toUpperCase()}
		</span>
	);
}

export function KindGlyph({ kind, className }: { kind: ShareView["kind"]; className?: string | undefined }) {
	return kind === "people" ? (
		<svg
			viewBox="0 0 16 16"
			className={cn("h-3.5 w-3.5", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			aria-hidden="true"
		>
			<circle cx="6" cy="5.5" r="2.3" />
			<path d="M1.8 13c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6" strokeLinecap="round" />
			<path d="M10.4 3.4a2.3 2.3 0 0 1 0 4.3M12 9.7c1.2.5 2 1.6 2.3 3.3" strokeLinecap="round" />
		</svg>
	) : (
		<svg
			viewBox="0 0 16 16"
			className={cn("h-3.5 w-3.5", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<path d="M7 9a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
			<path d="M9 7a2.6 2.6 0 0 0-3.7 0L3.1 9.2a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
		</svg>
	);
}
