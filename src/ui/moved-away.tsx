import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { MovedAway } from "../daemon/moved-away";
import { signInCloudAccount } from "./api";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { Button } from "./primitives/actions";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "./primitives/overlays";

export type { MovedAway };

/** What a moved-away project's cover pictures in place of its frames: where design/ went. */
export function MovedArt({ moved }: { moved: MovedAway }) {
	return (
		<span className="absolute inset-[12px] grid place-items-center rounded-[6px] border border-line-strong border-dashed">
			<span className="flex flex-col items-center gap-[6px] text-center">
				<span className="font-mono text-secondary type-detail">design/ moved to {moved.team}</span>
				<span className="text-secondary type-label">Not on this Mac</span>
			</span>
		</span>
	);
}

/** What the cover's quiet line says of the move: who moved it, from git's move commit. */
export function movedBy(moved: MovedAway): string | undefined {
	return moved.commit === null ? undefined : `moved by ${moved.commit.author}`;
}

/**
 * The sheet a moved-away project opens, on Home and over its open canvas (spool#194): who moved it in which commit,
 * then what this account can do by its standing alone. Remove from Home is Hide from Spool.
 */
export function MovedSheet({
	name,
	moved,
	onRemove,
	onClose,
}: {
	name: string;
	moved: MovedAway;
	onRemove: () => void;
	onClose: () => void;
}) {
	const id = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		const previous = document.activeElement;
		dialog?.showModal?.();
		dialog?.querySelector<HTMLButtonElement>("button[data-primary]")?.focus();
		return () => {
			dialog?.close?.();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	const { team, commit, standing, leftover } = moved;
	const who = commit?.author;
	const primary =
		standing === "viewer"
			? {
					label: "Open in browser",
					act: () => {
						window.open(moved.url, "_blank", "noopener,noreferrer");
						onClose();
					},
				}
			: standing === "signed-out"
				? {
						label: "Sign in",
						act: () => {
							void signInCloudAccount();
							onClose();
						},
					}
				: { label: "OK", act: onClose };
	return (
		<Dialog
			native
			ref={dialogRef}
			tabIndex={-1}
			data-moved-sheet={standing}
			aria-labelledby={`${id}-title`}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<DialogHeader titleId={`${id}-title`} title={`${name} moved to ${team}`} />
			<DialogBody>
				<p className="text-secondary type-body">
					{commit === null
						? `Its design/ moved out of git to ${moved.url}.`
						: `${commit.author} moved it out of git in ${commit.hash.slice(0, 7)} “design: moved to Spool Cloud”.`}
				</p>
				{standing === "outside" && (
					<>
						<p className="text-secondary type-body">
							You’re not in {team}. Ask {who ?? `an admin of ${team}`} to invite you, and it fills in here by
							itself.
						</p>
						{leftover.length > 0 && (
							<>
								<p className="text-secondary type-body">
									Your {leftover.length === 1 ? "frame that was" : `${leftover.length} frames that were`} never
									committed {leftover.length === 1 ? "is" : "are"} still in design/, and{" "}
									{leftover.length === 1 ? "goes" : "go"} up once you’re in:
								</p>
								<ul data-leftover="" className="flex flex-col font-mono text-primary type-detail">
									{leftover.map((frame) => (
										<li key={frame}>frames/{frame}</li>
									))}
								</ul>
							</>
						)}
					</>
				)}
				{standing === "viewer" && (
					<p className="text-secondary type-body">
						You’re a viewer of {team}, so {name} opens in the browser, read-only. To edit it here, ask an admin of{" "}
						{team} to make you an editor.
					</p>
				)}
				{standing === "signed-out" && (
					<p className="text-secondary type-body">
						Sign in and spool brings it back here if you’re in {team}. If you aren’t, ask{" "}
						{who ?? `an admin of ${team}`} to invite you.
					</p>
				)}
			</DialogBody>
			<DialogFooter>
				<Button
					onClick={() => {
						onRemove();
						onClose();
					}}
				>
					Remove from Home
				</Button>
				<Button variant="primary" data-primary="" onClick={primary.act}>
					{primary.label}
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
