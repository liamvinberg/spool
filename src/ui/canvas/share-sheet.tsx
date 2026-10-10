import { useEffect, useMemo, useRef, useState } from "react";
import { pageName, pageParent, ROOT_PAGE } from "../../page-path";
import { type ShareKind, type ShareRequest, type ShareView, sharedPageName } from "../../share-view";
import { CloseIcon } from "../icons";
import { Button, IconButton } from "../primitives/actions";
import { Field, TextField } from "../primitives/inputs";
import { Dialog, DialogBody, DialogFooter, DialogHeader, Scrim } from "../primitives/overlays";
import { Checkbox, RadioCard, RadioGroup } from "../primitives/selection";
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
		<>
			<Scrim />
			<div className="absolute inset-0 z-30 flex items-center justify-center p-4" data-share-sheet="">
				<Dialog aria-labelledby="share-sheet-title" className="relative max-h-[80vh]">
					<DialogHeader
						title={`Share ${[...chosen].sort().map(sharedPageName).join(", ") || "pages"}`}
						titleId="share-sheet-title"
						className="pr-8"
					/>
					<IconButton icon={<CloseIcon />} label="Close" className="absolute top-5 right-5" onClick={onClose} />
					{made === null ? (
						<>
							<DialogBody notice={error ?? undefined} className="min-h-0">
								<RadioGroup label="Who can see it">
									{(["people", "link"] as const).map((each) => (
										<RadioCard
											key={each}
											name="share-kind"
											value={each}
											checked={kind === each}
											onSelect={() => setKind(each)}
											label={
												<span className="flex items-center gap-2">
													<KindGlyph kind={each} />
													{each === "people" ? "Named people" : "Anyone with the link"}
												</span>
											}
										/>
									))}
								</RadioGroup>
								{kind === "people" && (
									<Field label="They sign in with one of these addresses to see it">
										{(id) => (
											<TextField
												size="lg"
												label="Email addresses"
												placeholder="kim@client.com, ola@client.com"
												value={people}
												onValueChange={setPeople}
												inputProps={{ id, ref: field }}
											/>
										)}
									</Field>
								)}
								<fieldset className="min-h-0 overflow-y-auto">
									<legend className="sr-only">Pages</legend>
									{[ROOT_PAGE, ...pages].map((each) => (
										<div
											key={each}
											className="flex h-row items-center"
											style={{ paddingLeft: Math.max(0, each.split("/").length - 1) * 12 }}
										>
											<Checkbox
												checked={chosen.has(each)}
												onCheckedChange={() => toggle(each)}
												label={sharedPageName(each)}
											/>
										</div>
									))}
								</fieldset>
								{leaving.length > 0 && (
									<div className="flex flex-col gap-1" data-share-leaving="">
										<p className="text-secondary type-label">
											{leaving.length === 1 ? "A link leaves" : `${leaving.length} links leave`} these pages.
											Whoever follows one sees it isn’t shared with them.
										</p>
										{leaving.slice(0, 5).map((link) => (
											<p
												key={`${link.from}\0${link.to}`}
												className="flex items-center gap-2 text-primary type-detail"
											>
												<span className="min-w-0 flex-1 truncate">
													{pageName(link.from)} → {pageName(link.to)}
													<span className="text-secondary"> on {sharedPageName(link.page)}</span>
												</span>
												<button
													type="button"
													className="shrink-0 text-secondary hover:text-primary type-label"
													onClick={() => toggle(link.page)}
												>
													Add {sharedPageName(link.page)}
												</button>
											</p>
										))}
									</div>
								)}
							</DialogBody>
							<DialogFooter>
								<Button size="lg" onClick={onClose}>
									Cancel
								</Button>
								<Button size="lg" variant="primary" disabled={!ready} onClick={() => void share()}>
									{busy ? "Sharing…" : "Share"}
								</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogBody>
								<p className="text-primary type-body">
									{made.kind === "link"
										? "Anyone with this link sees these pages."
										: "They sign in with their address at this link to see these pages."}
								</p>
								<div className="flex items-center gap-2">
									<TextField
										size="lg"
										mono
										className="flex-1"
										label="Link"
										value={made.link ?? ""}
										inputProps={{ readOnly: true }}
									/>
									<Button
										size="lg"
										variant="primary"
										onClick={() =>
											void navigator.clipboard?.writeText(made.link ?? "").then(() => setCopied(true))
										}
									>
										{copied ? "Copied" : "Copy link"}
									</Button>
								</div>
							</DialogBody>
							<DialogFooter>
								<Button size="lg" onClick={onClose}>
									Done
								</Button>
							</DialogFooter>
						</>
					)}
				</Dialog>
			</div>
		</>
	);
}
