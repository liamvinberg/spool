import { useState } from "react";
import type { CloudAccountState } from "./api";
import { cn } from "./cn";
import { HOME_ACTION } from "./home-actions";
import { ChevronIcon } from "./icons";

/**
 * The foot of Home's sidebar, where this Mac's account lives: Sign in, the wait while the
 * browser is open, and once signed in the account with its way out.
 */
export function AccountFoot({
	account,
	onSignIn,
	onReopen,
	onCancel,
	onSignOut,
}: {
	account: CloudAccountState;
	onSignIn: () => void;
	onReopen: () => void;
	onCancel: () => void;
	onSignOut: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	if (account.state === "signed-out")
		return (
			<div className="pj-account flex flex-col gap-[10px] [@media(max-width:720px)]:hidden">
				<p className="pl-[2px] text-muted type-label">Sign in to share links and join a team.</p>
				<button type="button" className={cn(HOME_ACTION, "w-full justify-start")} onClick={onSignIn}>
					Sign in
				</button>
			</div>
		);
	if (account.state === "signing-in")
		return (
			<div className="pj-account relative [@media(max-width:720px)]:hidden">
				<div
					role="status"
					className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-[300px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[16px]"
				>
					<p className="type-title">Finish in your browser</p>
					<p className="mt-[6px] text-muted type-control">
						spool.page is open in your browser. This comes back by itself once you’re in.
					</p>
					<div className="mt-[14px] flex gap-[8px]">
						<button type="button" className={HOME_ACTION} onClick={onReopen}>
							Open it again
						</button>
						<button type="button" className={HOME_ACTION} onClick={onCancel}>
							Cancel
						</button>
					</div>
				</div>
				<button type="button" className={cn(HOME_ACTION, "w-full justify-start bg-raised")} onClick={onReopen}>
					<span className="h-[8px] w-[8px] animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
					Waiting for the browser
				</button>
			</div>
		);
	if (account.state !== "signed-in") return null;
	return (
		<div className="pj-account relative">
			{menuOpen && (
				<>
					<button
						type="button"
						className="fixed inset-0 z-20 cursor-default"
						aria-label="Close menu"
						onClick={() => setMenuOpen(false)}
					/>
					<div className="absolute bottom-[calc(100%+8px)] left-0 z-30 flex w-[260px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit">
						<p className="truncate px-3 pt-[8px] pb-[9px] text-text type-control">{account.email}</p>
						<div className="mx-2 my-unit h-px bg-border-raised" />
						<a
							href={account.accountUrl}
							target="_blank"
							rel="noreferrer"
							className="flex h-[30px] items-center justify-between gap-[12px] rounded-sm px-3 text-text type-control hover:bg-surface"
							onClick={() => setMenuOpen(false)}
						>
							Passkeys and Macs
							<span className="text-muted type-detail">spool.page ↗</span>
						</a>
						<div className="mx-2 my-unit h-px bg-border-raised" />
						<button
							type="button"
							className="flex h-[30px] items-center rounded-sm px-3 text-left text-text type-control hover:bg-surface"
							onClick={() => {
								setMenuOpen(false);
								onSignOut();
							}}
						>
							Sign out of this Mac
						</button>
					</div>
				</>
			)}
			<button
				type="button"
				className="flex w-full items-center gap-[8px] rounded-[7px] px-[8px] py-[6px] text-left hover:bg-surface aria-expanded:bg-surface [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0"
				aria-expanded={menuOpen}
				aria-label={`Signed in as ${account.email}`}
				onClick={() => setMenuOpen(!menuOpen)}
			>
				<span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-control text-text uppercase type-detail">
					{account.email.slice(0, 1)}
				</span>
				<span className="min-w-0 flex-1 truncate text-muted type-detail [@media(max-width:720px)]:hidden">
					{account.email}
				</span>
				<span className="h-[10px] w-[10px] shrink-0 -rotate-90 text-muted [@media(max-width:720px)]:hidden [&>svg]:h-full [&>svg]:w-full">
					<ChevronIcon />
				</span>
			</button>
		</div>
	);
}
