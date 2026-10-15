import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pageChain, pageName, ROOT_PAGE } from "../page-path";
import {
	type ProjectShares,
	personName,
	type ShareKind,
	type ShareRequest,
	type SharesSource,
	type ShareView,
	saidAgo,
	sharedPageName,
	shareWho,
} from "../share-view";
import { cn } from "./cn";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { BackIcon, ShareIcon } from "./icons";
import { Button, IconButton } from "./primitives/actions";
import { SearchField, TextField } from "./primitives/inputs";
import { MenuItem, MenuSeparator, PaletteEmpty, Popover } from "./primitives/overlays";
import { ListRow, ScrollArea, TreeRow } from "./primitives/structure";
import { QrCode } from "./qr-code";
import {
	foundAt,
	foundRows,
	leavingLinks,
	type PickRow,
	pickRows,
	pressed,
	type ShareWalk,
	saidChoice,
	saidSize,
	shownRows,
	type Tick,
	tickOf,
} from "./share-pages";
import { KindGlyph, refusalSaid, SHARES_CHANGED } from "./shares";

/** Said on the window to open the Share popover on a page, as a page's right-click does: `{ page }`. */
export const SHARE_OPEN = "spool-share-open";

/** Ask the bar's Share popover to open, on this page. */
export function openShare(page: string): void {
	window.dispatchEvent(new CustomEvent(SHARE_OPEN, { detail: { page } }));
}

/** What the canvas tells a share about the project when the popover opens: where you are and what there is. */
export interface ShareContext {
	/** The page the canvas stands on. */
	page: string;
	/** Every named page. */
	pages: readonly string[];
	/** How many frames stand on each page. */
	frames: ReadonlyMap<string, number>;
	walks: readonly ShareWalk[];
}

/** Where a project's shares come from, and where a new one is made. */
export type ShareSource = SharesSource & {
	create(request: ShareRequest): Promise<{ share: ShareView } | { error: string }>;
};

/** ten rows, then the list scrolls: the popover is one size for 4 pages or 400 */
const LIST_HEIGHT = "calc(var(--spacing-row) * 10)";

type View = { kind: "new" } | { kind: "share"; id: string; made?: ShareView };

/**
 * Share, at the bar's end beside help and settings (DEV-193, task 156). It stands in every state, on Home too, so the bar
 * never moves: on Home it rests, signed out it opens to signing in, and on a project that may share it opens to
 * the page you're on, shared with anyone who has its link and ready as a QR code for a phone. More pages are
 * picked from the project's tree, and the project's shares are listed underneath, each opened in place.
 */
export function ShareControl({
	source,
	shares,
	context,
	onSignIn,
}: {
	/** The project in front, or null on Home, where there is nothing to share. */
	source: ShareSource | null;
	shares: ProjectShares | undefined;
	context: (() => ShareContext) | undefined;
	onSignIn: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ right: number; top: number } | null>(null);
	const [start, setStart] = useState<{ context: ShareContext; key: number } | null>(null);
	const button = useRef<HTMLButtonElement>(null);
	const popover = useRef<HTMLDivElement>(null);
	const disabled = source === null;

	const show = (page?: string) => {
		const box = button.current?.getBoundingClientRect();
		if (box === undefined) return;
		const read = context?.() ?? { page: ROOT_PAGE, pages: [], frames: new Map(), walks: [] };
		setStart((was) => ({ context: page === undefined ? read : { ...read, page }, key: (was?.key ?? 0) + 1 }));
		setAt({ right: window.innerWidth - box.right, top: box.bottom + 6 });
		setOpen(true);
	};
	// a page's right-click asks for it by name
	const showRef = useRef(show);
	showRef.current = show;
	useEffect(() => {
		const asked = (event: Event) => {
			const page = (event as CustomEvent<{ page?: string }>).detail?.page;
			showRef.current(page);
		};
		window.addEventListener(SHARE_OPEN, asked);
		return () => window.removeEventListener(SHARE_OPEN, asked);
	}, []);

	useEffect(() => {
		if (!open) return;
		const detach = attachHotkeyLayer({ scope: "picker", handlers: {} });
		const away = (event: Event) => {
			if (!(event.target instanceof Node)) return;
			if (button.current?.contains(event.target) || popover.current?.contains(event.target)) return;
			setOpen(false);
		};
		const key = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			button.current?.focus();
			setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			detach();
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	// a project closed or left while open takes its popover with it
	useEffect(() => {
		if (disabled) setOpen(false);
	}, [disabled]);

	return (
		<>
			<IconButton
				ref={button}
				data-bar-end="share"
				icon={<ShareIcon />}
				label={disabled ? "Share (open a project first)" : "Share"}
				aria-haspopup="dialog"
				aria-expanded={open}
				pressed={open}
				disabled={disabled}
				onClick={() => (open ? setOpen(false) : show())}
			/>
			{open &&
				at !== null &&
				start !== null &&
				source !== null &&
				createPortal(
					<Popover
						ref={popover}
						aria-label="Share"
						data-share-popover=""
						pad="sm"
						className="fixed z-50 w-[340px] overflow-y-auto"
						style={{ right: at.right, top: at.top, maxHeight: `calc(100vh - ${at.top + 12}px)` }}
					>
						<ShareBody
							key={start.key}
							source={source}
							shares={shares}
							context={start.context}
							onSignIn={onSignIn}
						/>
					</Popover>,
					document.body,
				)}
		</>
	);
}

function ShareBody({
	source,
	shares,
	context,
	onSignIn,
}: {
	source: ShareSource;
	shares: ProjectShares | undefined;
	context: ShareContext;
	onSignIn: () => void;
}) {
	const [view, setView] = useState<View>({ kind: "new" });
	if (shares === undefined) return <Said>Reading this project’s shares…</Said>;
	if (shares.state === "signed-out")
		return (
			<div className="flex flex-col gap-3 p-2" data-share-signed-out="">
				<p className="text-secondary type-control">Sign in to share this project’s pages with a link.</p>
				<Button size="sm" variant="primary" className="self-start" onClick={onSignIn}>
					Sign in
				</Button>
			</div>
		);
	if (shares.state === "unreachable") return <Said>spool.page didn’t answer just now. Try again in a moment.</Said>;
	if (shares.state === "unavailable") return <Said>This project can’t share from this Mac.</Said>;

	if (view.kind === "share") {
		const share = shares.shares.find((each) => each.id === view.id) ?? view.made;
		if (share !== undefined)
			return (
				<ShareDetail share={share} source={source} manage={shares.manage} onBack={() => setView({ kind: "new" })} />
			);
	}
	return (
		<>
			{shares.manage ? (
				<NewShare
					source={source}
					context={context}
					onMade={(made) => setView({ kind: "share", id: made.id, made })}
				/>
			) : (
				<Said>Only editors and admins share this project’s pages.</Said>
			)}
			{shares.shares.length > 0 && (
				<>
					<MenuSeparator />
					{shares.shares.map((share) => (
						<MenuItem
							key={share.id}
							data-share-row={share.id}
							icon={<KindGlyph kind={share.kind} />}
							label={shareWho(share)}
							meta={share.pages.map(sharedPageName).join(", ")}
							disabled={!shares.manage}
							onClick={() => setView({ kind: "share", id: share.id })}
						/>
					))}
				</>
			)}
		</>
	);
}

function Said({ children }: { children: string }) {
	return <p className="px-2 py-1.5 text-secondary type-control">{children}</p>;
}

function NewShare({
	source,
	context,
	onMade,
}: {
	source: ShareSource;
	context: ShareContext;
	onMade: (share: ShareView) => void;
}) {
	const rows = useMemo(() => pickRows(context.pages, context.frames), [context]);
	const [kind, setKind] = useState<ShareKind>("link");
	const [people, setPeople] = useState("");
	const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set([context.page]));
	const [picking, setPicking] = useState(false);
	const [query, setQuery] = useState("");
	// the page you're on stands open in the tree
	const [folders, setFolders] = useState<ReadonlySet<string>>(() => new Set(pageChain(context.page).slice(0, -1)));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const addresses = people
		.split(/[\s,;]+/u)
		.map((one) => one.trim())
		.filter((one) => one !== "");
	const leaving = useMemo(() => leavingLinks(context.walks, chosen), [context.walks, chosen]);
	const ready = chosen.size > 0 && (kind === "link" || addresses.length > 0) && !busy;
	const found = foundRows(rows, query);
	const only = chosen.size === 1 && chosen.has(context.page);

	const share = async () => {
		setBusy(true);
		setError(null);
		const answer = await source.create({
			kind,
			pages: [...chosen].sort(),
			...(kind === "people" ? { people: addresses } : {}),
		});
		setBusy(false);
		if ("error" in answer) setError(refusalSaid(answer.error));
		else {
			window.dispatchEvent(new CustomEvent(SHARES_CHANGED));
			onMade(answer.share);
		}
	};

	return (
		<div className="flex flex-col" data-share-new="">
			{(["link", "people"] as const).map((each) => (
				<MenuItem
					key={each}
					checked={kind === each}
					label={each === "link" ? "Anyone with the link" : "Named people"}
					onClick={() => setKind(each)}
				/>
			))}
			{kind === "people" && (
				<div className="px-1 pt-1 pb-0.5">
					<TextField
						size="sm"
						label="Email addresses"
						placeholder="kim@client.com, ola@client.com"
						value={people}
						onValueChange={setPeople}
						inputProps={{ autoFocus: true }}
					/>
				</div>
			)}
			<MenuSeparator />
			{picking ? (
				<Picker
					rows={rows}
					chosen={chosen}
					query={query}
					onQuery={setQuery}
					found={found}
					open={folders}
					onFlip={(page) =>
						setFolders((was) => {
							const next = new Set(was);
							if (next.has(page)) next.delete(page);
							else next.add(page);
							return next;
						})
					}
					onPress={(row) => setChosen((was) => pressed(row, was))}
				/>
			) : (
				<div className="flex h-row-roomy shrink-0 items-center gap-2 pr-1 pl-3">
					<p className="min-w-0 flex-1 truncate text-secondary type-control">
						{chosen.size === 0 ? (
							"No pages chosen"
						) : (
							<>
								Shares{" "}
								<span className="text-primary">
									{only ? sharedPageName(context.page) : saidChoice(chosen, rows)}
								</span>
								{only ? ", the page you’re on" : ""}
							</>
						)}
					</p>
					{rows.length > 0 && (
						<Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
							{only ? "Add pages" : "Change"}
						</Button>
					)}
				</div>
			)}
			{leaving.length > 0 && (
				<div className="flex flex-col px-3 pb-1" data-share-leaving="">
					<p className="py-1 text-secondary type-label">
						{leaving.length === 1 ? "A link leaves" : `${leaving.length} links leave`} these pages. Whoever
						follows one sees it isn’t shared with them.
					</p>
					{leaving.slice(0, 3).map((link) => (
						<p key={`${link.from}\0${link.to}`} className="flex h-6 items-center gap-2 type-detail">
							<span className="min-w-0 flex-1 truncate text-primary">
								{pageName(link.from)} → {pageName(link.to)}
								<span className="text-secondary"> on {sharedPageName(link.page)}</span>
							</span>
							<button
								type="button"
								className="shrink-0 cursor-pointer text-secondary hover:text-primary type-label"
								onClick={() => setChosen((was) => new Set([...was, link.page]))}
							>
								Add {sharedPageName(link.page)}
							</button>
						</p>
					))}
				</div>
			)}
			<MenuSeparator />
			<div className="flex h-row-roomy shrink-0 items-center gap-2 pr-1 pl-3">
				<span className="min-w-0 flex-1 truncate text-secondary type-detail">
					{picking && query.trim() !== "" ? `${found.length} found · ` : ""}
					{saidSize(chosen, context.frames)}
				</span>
				<Button size="sm" variant="primary" disabled={!ready} onClick={() => void share()}>
					{busy ? "Sharing…" : "Share"}
				</Button>
			</div>
			{error !== null && (
				<p role="alert" className="px-3 pb-1.5 text-danger-strong type-label">
					{error}
				</p>
			)}
		</div>
	);
}

function Picker({
	rows,
	chosen,
	query,
	onQuery,
	found,
	open,
	onFlip,
	onPress,
}: {
	rows: readonly PickRow[];
	chosen: ReadonlySet<string>;
	query: string;
	onQuery: (next: string) => void;
	found: readonly PickRow[];
	open: ReadonlySet<string>;
	onFlip: (page: string) => void;
	onPress: (row: PickRow) => void;
}) {
	const finding = query.trim().toLowerCase();
	const press = (row: PickRow) => ({
		onClick: () => onPress(row),
		onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
			if (event.key !== " " && event.key !== "Enter") return;
			event.preventDefault();
			onPress(row);
		},
		tabIndex: 0,
	});
	return (
		<>
			<div className="shrink-0 px-1 pt-0.5 pb-1">
				<SearchField
					size="sm"
					hotkey=""
					placeholder={`Find among ${rows.length} ${rows.length === 1 ? "page" : "pages"}`}
					label="Find a page"
					value={query}
					onValueChange={onQuery}
					inputProps={{ autoFocus: true }}
				/>
			</div>
			<ScrollArea role="tree" aria-label="Pages" className="shrink-0" style={{ maxHeight: LIST_HEIGHT }}>
				{finding === "" ? (
					shownRows(rows, open).map((row) => {
						const tick = tickOf(row, chosen);
						const name = sharedPageName(row.page);
						return (
							<TreeRow
								key={row.page}
								data-share-page={row.page}
								tone="raised"
								mono
								depth={row.depth}
								branch={
									row.folder
										? { open: open.has(row.page), onToggle: () => onFlip(row.page), label: name }
										: undefined
								}
								label={
									<span className="flex min-w-0 items-center gap-2">
										<TickBox tick={tick} />
										<span className="min-w-0 truncate">{name}</span>
									</span>
								}
								meta={row.folder ? metaOf(row, chosen, tick) : undefined}
								aria-selected={tick === "all"}
								className={cn("cursor-pointer rounded-sm", tick !== "none" && "text-primary")}
								{...press(row)}
							/>
						);
					})
				) : found.length === 0 ? (
					<PaletteEmpty className="px-3">no page matches {finding}</PaletteEmpty>
				) : (
					found.map((row) => {
						const name = sharedPageName(row.page);
						const at = name.toLowerCase().indexOf(finding);
						const tick = tickOf(row, chosen);
						return (
							<ListRow
								key={row.page}
								data-share-page={row.page}
								role="treeitem"
								aria-selected={tick === "all"}
								tone="raised"
								mono
								label={
									<span className="flex min-w-0 items-center gap-2">
										<TickBox tick={tick} />
										<span className="min-w-0 truncate">
											{name.slice(0, at)}
											<span className="text-primary">{name.slice(at, at + finding.length)}</span>
											{name.slice(at + finding.length)}
										</span>
									</span>
								}
								meta={foundAt(row)}
								className="cursor-pointer rounded-sm pl-2"
								{...press(row)}
							/>
						);
					})
				)}
			</ScrollArea>
		</>
	);
}

/** A folder's count: every page under it, or how many of them are chosen while only some are. */
function metaOf(row: PickRow, chosen: ReadonlySet<string>, tick: Tick): string {
	const total = row.takes.length;
	return tick === "some" ? `${row.takes.filter((page) => chosen.has(page)).length}/${total}` : String(total);
}

/** The selection family's checkbox, with the third state a folder needs: mixed, a bar where the check goes. */
function TickBox({ tick }: { tick: Tick }) {
	return (
		<span
			aria-hidden="true"
			data-tick={tick}
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-xs border text-on-accent",
				"transition-[background-color,border-color] duration-quick ease-out",
				tick === "none" ? "border-tertiary group-hover/row:border-secondary" : "border-accent bg-accent",
			)}
		>
			{tick === "all" ? (
				<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-3">
					<path
						d="m3.5 8.25 3 3 6-6.5"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : tick === "some" ? (
				<span className="h-0.5 w-2 rounded-full bg-current" />
			) : null}
		</span>
	);
}

/**
 * One share opened in place: whom and what, its QR code and link for a phone, its people where it names them, and
 * the one way to end it.
 */
function ShareDetail({
	share,
	source,
	manage,
	onBack,
}: {
	share: ShareView;
	source: SharesSource;
	manage: boolean;
	onBack: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [adding, setAdding] = useState("");
	const [said, setSaid] = useState<string | null>(null);
	const changed = (refused: string | null) => {
		setSaid(refused === null ? null : refusalSaid(refused));
		window.dispatchEvent(new CustomEvent(SHARES_CHANGED));
	};
	const add = async () => {
		const people = adding
			.split(/[\s,;]+/u)
			.map((one) => one.trim())
			.filter((one) => one !== "");
		if (people.length === 0) return;
		const refused = await source.change(share.id, { add: people });
		if (refused === null) setAdding("");
		changed(refused);
	};
	return (
		<div className="flex flex-col" data-share-opened={share.id}>
			<div className="flex h-row shrink-0 items-center gap-1 pr-2">
				<IconButton size="sm" icon={<BackIcon />} label="Back" onClick={onBack} />
				<span className="flex size-4 shrink-0 items-center justify-center text-secondary">
					<KindGlyph kind={share.kind} />
				</span>
				<span className="min-w-0 flex-1 truncate pl-1 text-primary type-control">{shareWho(share)}</span>
				<span className="max-w-[45%] shrink-0 truncate text-secondary type-detail">
					{share.pages.map(sharedPageName).join(", ")}
				</span>
			</div>
			{share.link !== undefined && (
				<div className="flex shrink-0 gap-3 px-2 pt-1 pb-2">
					<QrCode value={share.link} size={124} />
					<div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
						<p className="text-secondary type-label">
							{share.kind === "link"
								? "Scan it with your phone’s camera to open it there, full screen."
								: "Scan it with your phone’s camera. They sign in with their address to see it."}
						</p>
						<div className="flex flex-col gap-2">
							<p className="truncate text-secondary type-detail">{share.link.replace(/^https:\/\//u, "")}</p>
							<Button
								size="sm"
								variant="primary"
								className="self-start"
								onClick={() =>
									void navigator.clipboard?.writeText(share.link ?? "").then(() => setCopied(true))
								}
							>
								{copied ? "Copied" : "Copy link"}
							</Button>
						</div>
					</div>
				</div>
			)}
			{share.kind === "people" && (
				<>
					<MenuSeparator />
					<ul className="flex flex-col px-2">
						{share.people.map((email) => (
							<li key={email} className="flex h-7 items-center gap-2 text-primary type-detail">
								<span className="min-w-0 flex-1 truncate">{email}</span>
								{manage && (
									<button
										type="button"
										aria-label={`Remove ${email}`}
										className="cursor-pointer px-1 text-secondary hover:text-primary"
										onClick={async () => changed(await source.change(share.id, { remove: [email] }))}
									>
										×
									</button>
								)}
							</li>
						))}
					</ul>
					{manage && (
						<form
							className="px-1 pt-1 pb-1"
							onSubmit={(event) => {
								event.preventDefault();
								void add();
							}}
						>
							<TextField
								size="sm"
								label="Add someone by email"
								placeholder="Add someone by email"
								value={adding}
								onValueChange={setAdding}
							/>
						</form>
					)}
				</>
			)}
			<MenuSeparator />
			<div className="flex h-row shrink-0 items-center gap-2 pr-1 pl-2">
				<span className="min-w-0 flex-1 truncate text-secondary type-detail">
					{personName(share.by)} · {saidAgo(share.at)} · {share.opens} {share.opens === 1 ? "open" : "opens"}
				</span>
				{manage && (
					<Button
						size="sm"
						variant="ghost"
						onClick={async () => {
							const refused = await source.stop(share.id);
							changed(refused);
							if (refused === null) onBack();
						}}
					>
						Stop sharing
					</Button>
				)}
			</div>
			{said !== null && <p className="px-2 pb-1.5 text-danger-strong type-label">{said}</p>}
		</div>
	);
}
