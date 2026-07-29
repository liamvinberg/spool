import { useCallback, useEffect, useState } from "react";
import { browseDirectory, type FsListing, initProjectAt, openProjectAt } from "./api";
import { attachHotkeyLayer, type HotkeyHandler } from "./hotkey-dispatch";
import type { HotkeyIdFor } from "./hotkeys";
import { BackIcon } from "./icons";

/**
 * The "+" folder picker (#4/#22): browse the daemon's disk, pick a folder,
 * open resolves by git-style walk-up; when nothing is found the picker offers
 * init in place — the app button is the fallback door to the one scaffold.
 */

export function FolderPicker({
	onOpened,
	onClose,
}: {
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
}) {
	const [listing, setListing] = useState<FsListing | null>(null);
	const [offerInit, setOfferInit] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const browse = useCallback(async (path?: string) => {
		setOfferInit(false);
		setNotice(null);
		const listing = await browseDirectory(path);
		if (listing !== undefined) setListing(listing);
	}, []);

	useEffect(() => {
		void browse();
	}, [browse]);

	useEffect(() => {
		return attachHotkeyLayer({
			scope: "picker",
			handlers: {
				"picker.close": () => onClose(),
			} satisfies Record<HotkeyIdFor<"picker">, HotkeyHandler>,
		});
	}, [onClose]);

	const openHere = async () => {
		if (listing === null || busy) return;
		setBusy(true);
		try {
			const outcome = await openProjectAt(listing.path);
			if (outcome.kind === "opened") onOpened({ root: outcome.root, name: outcome.name });
			else if (outcome.kind === "offer-init") setOfferInit(true);
			else setNotice(outcome.message);
		} finally {
			setBusy(false);
		}
	};

	const initHere = async () => {
		if (listing === null || busy) return;
		setBusy(true);
		try {
			const outcome = await initProjectAt(listing.path);
			if (outcome.kind === "opened") onOpened({ root: outcome.root, name: outcome.name });
			else if (outcome.kind === "error") setNotice(outcome.message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center">
			<button type="button" aria-label="Close" className="absolute inset-0 bg-bg/70" onClick={onClose} />
			<dialog
				open
				className="relative m-0 flex max-h-[70vh] w-[560px] flex-col rounded-lg border border-border bg-surface p-0 text-text"
			>
				<header className="flex items-center gap-3 border-border border-b px-4 py-3">
					<button
						type="button"
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-raised disabled:opacity-40"
						onClick={() => void browse(listing?.parent ?? undefined)}
						disabled={listing?.parent == null}
						title="Up one folder"
					>
						<BackIcon />
					</button>
					<span className="truncate font-mono text-muted text-xs leading-xs">{listing?.path ?? "…"}</span>
				</header>

				<div className="min-h-32 flex-1 overflow-y-auto p-2">
					{listing?.dirs.map((dir) => (
						<button
							key={dir.path}
							type="button"
							className="flex h-8 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-raised"
							onDoubleClick={() => void browse(dir.path)}
							onClick={() => void browse(dir.path)}
						>
							<span className="flex-1 truncate text-base text-text leading-xs">{dir.name}</span>
							{dir.isProject && <span className="shrink-0 font-mono text-2xs text-thread">spool</span>}
						</button>
					))}
					{listing !== null && listing.dirs.length === 0 && (
						<p className="px-3 py-4 font-mono text-muted text-xs">no folders here</p>
					)}
				</div>

				<footer className="flex items-center gap-3 border-border border-t px-4 py-3">
					{notice !== null && <span className="flex-1 truncate font-mono text-thread text-xs">{notice}</span>}
					{offerInit && notice === null && (
						<span className="flex-1 truncate font-mono text-muted text-xs">
							not a spool project — initialize design/ here?
						</span>
					)}
					{!offerInit && notice === null && <span className="flex-1" />}
					<button
						type="button"
						className="flex h-7 items-center rounded-md px-3 text-muted text-sm hover:text-text"
						onClick={onClose}
					>
						Cancel
					</button>
					{offerInit ? (
						<button
							type="button"
							className="flex h-7 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text disabled:opacity-40"
							onClick={() => void initHere()}
							disabled={busy}
						>
							Initialize here
						</button>
					) : (
						<button
							type="button"
							className="flex h-7 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text disabled:opacity-40"
							onClick={() => void openHere()}
							disabled={busy || listing === null}
						>
							Open this folder
						</button>
					)}
				</footer>
			</dialog>
		</div>
	);
}
