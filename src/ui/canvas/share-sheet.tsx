import { useEffect, useMemo, useRef, useState } from "react";
import { pageName, pageParent, ROOT_PAGE } from "../../page-path";
import { type ShareKind, type ShareRequest, type ShareView, sharedPageName } from "../../share-view";
import { cn } from "../cn";
import { KindGlyph, refusalSaid } from "../shares";

/** A walk the flow map knows: from one frame to another. */
export interface ShareWalk {
	from: string;
	to: string;
}

/** A link out of the pages a share would show: the frame it leaves from, and where it goes. */
export interface LeavingLink {
	from: string;
	to: string;
	/** The page it lands on, which the share doesn't show. */
	page: string;
}

/**
 * The flow map's links that leave the pages a share would show: from a frame on them to a frame elsewhere. Said
 * as a warning, never a block: whoever follows one sees that screen isn't shared with them.
 */
export function leavingLinks(walks: readonly ShareWalk[], pages: ReadonlySet<string>): LeavingLink[] {
	const seen = new Set<string>();
	const leaving: LeavingLink[] = [];
	for (const walk of walks) {
		const from = pageParent(walk.from);
		const to = pageParent(walk.to);
		if (!pages.has(from) || pages.has(to)) continue;
		const key = `${walk.from}\0${walk.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		leaving.push({ from: walk.from, to: walk.to, page: to });
	}
	return leaving;
}

/**
 * Sharing pages, from a page's right-click: the page it was opened on, and any others to go with it, shown to
 * named people (who sign in as one of the addresses) or to anyone with the link. The flow map warns about links
 * that leave them, and offers to add the page each lands on. Once made, its link is there to copy.
 */
export function ShareSheet({
	page,
	pages,
	walks,
	onCreate,
	onClose,
}: {
	page: string;
	/** Every named page, as the rail lists them; the root page is listed first, as the top page. */
	pages: readonly string[];
	walks: readonly ShareWalk[];
	onCreate: (request: ShareRequest) => Promise<{ share: ShareView } | { error: string }>;
	onClose: () => void;
}) {
	const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set([page]));
	const [kind, setKind] = useState<ShareKind>("people");
	const [people, setPeople] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [made, setMade] = useState<ShareView | null>(null);
	const [copied, setCopied] = useState(false);
	const field = useRef<HTMLInputElement | null>(null);
	const leaving = useMemo(() => leavingLinks(walks, chosen), [walks, chosen]);
	const addresses = people
		.split(/[\s,;]+/u)
		.map((one) => one.trim())
		.filter((one) => one !== "");
	useEffect(() => field.current?.focus(), []);
	useEffect(() => {
		const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [onClose]);
	const toggle = (name: string) =>
		setChosen((current) => {
			const next = new Set(current);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	const share = async () => {
		setBusy(true);
		setError(null);
		const answer = await onCreate({
			kind,
			pages: [...chosen].sort(),
			...(kind === "people" ? { people: addresses } : {}),
		});
		setBusy(false);
		if ("error" in answer) setError(refusalSaid(answer.error));
		else setMade(answer.share);
	};
	const ready = chosen.size > 0 && (kind === "link" || addresses.length > 0) && !busy;

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/55" data-share-sheet="">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="share-sheet-title"
				className="flex max-h-[80vh] w-[420px] flex-col rounded-lg border border-border-raised bg-raised"
			>
				<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
					<h2 id="share-sheet-title" className="font-medium type-title">
						Share {[...chosen].sort().map(sharedPageName).join(", ") || "pages"}
					</h2>
					<button type="button" aria-label="Close" className="text-muted hover:text-text" onClick={onClose}>
						×
					</button>
				</div>
				{made === null ? (
					<>
						<div className="flex gap-2 border-border-raised border-b px-5 py-3">
							{(["people", "link"] as const).map((each) => (
								<button
									key={each}
									type="button"
									aria-pressed={kind === each}
									onClick={() => setKind(each)}
									className={cn(
										"flex h-8 flex-1 items-center justify-center gap-2 rounded-sm border type-control",
										kind === each ? "border-thread bg-surface text-text" : "border-border-raised text-muted",
									)}
								>
									<KindGlyph kind={each} />
									{each === "people" ? "Named people" : "Anyone with the link"}
								</button>
							))}
						</div>
						{kind === "people" && (
							<label className="flex flex-col gap-1.5 border-border-raised border-b px-5 py-3">
								<span className="text-muted type-label">
									They sign in with one of these addresses to see it
								</span>
								<input
									ref={field}
									aria-label="Email addresses"
									placeholder="kim@client.com, ola@client.com"
									value={people}
									onChange={(event) => setPeople(event.target.value)}
									className="h-8 rounded-sm border border-muted bg-bg px-2 text-text outline-none type-detail placeholder:text-muted focus:border-text"
								/>
							</label>
						)}
						<fieldset className="min-h-0 overflow-y-auto border-border-raised border-b px-5 py-3">
							<legend className="sr-only">Pages</legend>
							{[ROOT_PAGE, ...pages].map((each) => (
								<label key={each} className="flex h-7 cursor-pointer items-center gap-2 type-detail">
									<input
										type="checkbox"
										checked={chosen.has(each)}
										onChange={() => toggle(each)}
										className="accent-thread"
									/>
									<span
										className={chosen.has(each) ? "text-text" : "text-muted"}
										style={{ paddingLeft: Math.max(0, each.split("/").length - 1) * 12 }}
									>
										{sharedPageName(each)}
									</span>
								</label>
							))}
						</fieldset>
						{leaving.length > 0 && (
							<div className="flex flex-col gap-1 border-border-raised border-b px-5 py-3" data-share-leaving="">
								<p className="text-muted type-label">
									{leaving.length === 1 ? "A link leaves" : `${leaving.length} links leave`} these pages.
									Whoever follows one sees it isn’t shared with them.
								</p>
								{leaving.slice(0, 5).map((link) => (
									<p
										key={`${link.from}\0${link.to}`}
										className="flex items-center gap-2 text-text type-detail"
									>
										<span className="min-w-0 flex-1 truncate">
											{pageName(link.from)} → {pageName(link.to)}
											<span className="text-muted"> on {sharedPageName(link.page)}</span>
										</span>
										<button
											type="button"
											className="shrink-0 text-muted hover:text-text type-label"
											onClick={() => toggle(link.page)}
										>
											Add {sharedPageName(link.page)}
										</button>
									</p>
								))}
							</div>
						)}
						<div className="flex items-center justify-end gap-3 px-5 py-3">
							{error !== null && <span className="min-w-0 flex-1 text-thread type-label">{error}</span>}
							<button type="button" className="text-muted hover:text-text type-control" onClick={onClose}>
								Cancel
							</button>
							<button
								type="button"
								disabled={!ready}
								onClick={() => void share()}
								className="h-8 rounded-sm bg-text px-3 text-bg disabled:opacity-40 type-control"
							>
								{busy ? "Sharing…" : "Share"}
							</button>
						</div>
					</>
				) : (
					<div className="flex flex-col gap-3 px-5 py-4">
						<p className="text-text type-detail">
							{made.kind === "link"
								? "Anyone with this link sees these pages."
								: "They sign in with their address at this link to see these pages."}
						</p>
						<div className="flex items-center gap-2">
							<input
								readOnly
								aria-label="Link"
								value={made.link ?? ""}
								className="h-8 min-w-0 flex-1 rounded-sm border border-border-raised bg-bg px-2 text-text type-detail"
							/>
							<button
								type="button"
								className="h-8 rounded-sm bg-text px-3 text-bg type-control"
								onClick={() => void navigator.clipboard?.writeText(made.link ?? "").then(() => setCopied(true))}
							>
								{copied ? "Copied" : "Copy link"}
							</button>
						</div>
						<button type="button" className="self-end text-muted hover:text-text type-control" onClick={onClose}>
							Done
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
