import { useState } from "react";
import type { CloudAccountState } from "./api";
import { ChevronIcon } from "./icons";
import { Button, ButtonGroup } from "./primitives/actions";
import { Dot } from "./primitives/display";
import { Menu, MenuItem, MenuSeparator, Popover } from "./primitives/overlays";

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
	inBrowser = false,
	onAccount,
}: {
	account: CloudAccountState;
	/** At spool.page itself rather than on a Mac: the account page is here, and signing out is this browser's. */
	inBrowser?: boolean;
	/** At spool.page: Account opens in place, as Home's own page. */
	onAccount?: () => void;
	onSignIn: () => void;
	onReopen: () => void;
	onCancel: () => void;
	onSignOut: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	if (account.state === "signed-out")
		return (
			<div className="pj-account flex flex-col gap-[10px] [@media(max-width:720px)]:hidden">
				{account.failed === undefined ? (
					<p className="pl-[2px] text-secondary type-label">Sign in to share links and join a team.</p>
				) : (
					<p role="alert" className="pl-[2px] text-danger-strong type-label">
						Sign-in didn’t finish: {account.failed}
					</p>
				)}
				<Button className="w-full justify-start" onClick={onSignIn}>
					Sign in
				</Button>
			</div>
		);
	if (account.state === "signing-in")
		return (
			<div className="pj-account relative [@media(max-width:720px)]:hidden">
				<Popover role="status" className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-panel gap-2">
					<p className="type-title">Finish in your browser</p>
					<p className="text-secondary type-control">
						spool.page is open in your browser. This comes back by itself once you’re in.
					</p>
					<ButtonGroup className="mt-2">
						<Button onClick={onReopen}>Open it again</Button>
						<Button onClick={onCancel}>Cancel</Button>
					</ButtonGroup>
				</Popover>
				<Button className="w-full justify-start" onClick={onReopen}>
					<Dot tone="secondary" size="md" className="motion-safe:animate-pulse!" />
					Waiting for the browser
				</Button>
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
					<Menu aria-label={account.email} className="absolute bottom-[calc(100%+8px)] left-0 z-30">
						<p className="flex h-row items-center truncate px-3 text-primary type-control">{account.email}</p>
						<MenuSeparator />
						{inBrowser ? (
							<MenuItem
								href={account.accountUrl}
								label="Account"
								onClick={(event) => {
									setMenuOpen(false);
									if (onAccount === undefined) return;
									event.preventDefault();
									onAccount();
								}}
							/>
						) : (
							<MenuItem
								href={account.accountUrl}
								target="_blank"
								rel="noreferrer"
								label="Account"
								meta="spool.page ↗"
								onClick={() => setMenuOpen(false)}
							/>
						)}
						<MenuSeparator />
						<MenuItem
							label={inBrowser ? "Sign out" : "Sign out of this Mac"}
							onClick={() => {
								setMenuOpen(false);
								onSignOut();
							}}
						/>
					</Menu>
				</>
			)}
			<button
				type="button"
				className="flex w-full items-center gap-[8px] rounded-[7px] px-[8px] py-[6px] text-left hover:bg-surface-panel aria-expanded:bg-surface-panel [@media(max-width:720px)]:justify-center [@media(max-width:720px)]:px-0"
				aria-expanded={menuOpen}
				aria-label={`Signed in as ${account.email}`}
				onClick={() => setMenuOpen(!menuOpen)}
			>
				<span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-surface-control text-primary uppercase type-detail">
					{account.email.slice(0, 1)}
				</span>
				<span className="min-w-0 flex-1 truncate text-secondary type-detail [@media(max-width:720px)]:hidden">
					{account.email}
				</span>
				<span className="h-[10px] w-[10px] shrink-0 -rotate-90 text-secondary [@media(max-width:720px)]:hidden [&>svg]:h-full [&>svg]:w-full">
					<ChevronIcon />
				</span>
			</button>
		</div>
	);
}
