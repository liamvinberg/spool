import { cn } from "shared/lib/utils";
import { ArrowRightIcon, CheckIcon } from "shared/ui/spool/icons";
import {
	Account,
	AppHome,
	AppToast,
	BUTTON,
	CodeBoxes,
	Field,
	GoogleMark,
	type Links,
	MenuPlus,
	MenuRow,
	MenuRule,
	OwnMark,
	PRIMARY,
	Says,
	Small,
	Switch,
	SwitchMenu,
	Title,
	TouchId,
	WebPage,
	WIDE,
} from "./parts";

/**
 * Take two: email first. The page asks one thing, your address, and the
 * address picks the way in: Gmail and Workspace addresses are offered Google,
 * any other gets a code, and a passkey on this Mac shows up in the field itself
 * through the browser's autofill. The column grows in place, with the address
 * pinned at its top, so each step reads as the same sign-in going on.
 * In the app, signing in lives in the switcher, where teams will appear.
 *
 * Bets that one question is easier than two doors, at one extra step for
 * people who would have pressed Google straight away.
 */

export type EmailFirstState = "app" | "page" | "code" | "passkey" | "done" | "done-app" | "returning";

const SAYS: Record<EmailFirstState, string> = {
	app: "Email first. Sign in lives in the switcher, the menu your teams will join, and the row waits there while the browser is open.",
	page: "Email first. The button follows the address: Gmail and Workspace get Google, anything else gets a code.",
	code: "Email first. The address stays pinned above each step, so the code reads as the same sign-in carrying on.",
	passkey: "Email first. The offer says where the passkey will show up next time: in this same field.",
	done: "Email first. The column ends where it started, with the address on top.",
	"done-app": "Email first. Your account sits at the foot of the switcher, under the teams it belongs to.",
	returning: "Email first. With a passkey on this Mac the browser offers it in the field before a letter is typed.",
};

export function SignInEmailFirst({ state = "page", links = {} }: { state?: EmailFirstState; links?: Links<EmailFirstState> }) {
	const caption = SAYS[state];
	if (state === "app") return <EmailApp links={links} caption={caption} />;
	if (state === "done-app") return <EmailSignedIn caption={caption} />;

	const pinned = (done = false) => (
		<Field
			value="ada@tidemark.app"
			fixed
			trail={
				done ? (
					<CheckIcon className="h-[14px] w-[14px] text-muted" />
				) : (
					<button type="button" className="text-muted type-control hover:text-text" onClick={links.page}>
						Change
					</button>
				)
			}
		/>
	);

	if (state === "code") {
		return (
			<WebPage url="spool.page/sign-in" title="Sign in" caption={caption}>
				<Title>Sign in to spool</Title>
				{pinned()}
				<Says>Type the six-digit code we just sent there. It works for 10 minutes, on whichever device you read it.</Says>
				<button type="button" className="block text-left" onClick={links.passkey}>
					<CodeBoxes typed={4} />
				</button>
				<Small>
					Nothing yet? <span className="text-text underline decoration-border-raised underline-offset-4">Send a new code</span>
				</Small>
			</WebPage>
		);
	}
	if (state === "passkey") {
		return (
			<WebPage url="spool.page/sign-in" title="Sign in" caption={caption}>
				<Title>You're in</Title>
				{pinned(true)}
				<div className="flex gap-[16px] border-border border-t pt-[24px]">
					<TouchId className="mt-[2px] h-[30px] w-[30px] shrink-0 text-thread" />
					<div className="flex flex-col gap-[16px]">
						<Says>
							<span className="text-text">Next time, skip the email.</span> Add a passkey and your address shows up in this field with Touch ID behind it.
						</Says>
						<div className="flex gap-[10px]">
							<button type="button" className={PRIMARY} onClick={links.done}>
								Add a passkey
							</button>
							<button type="button" className={BUTTON} onClick={links.done}>
								Not now
							</button>
						</div>
					</div>
				</div>
			</WebPage>
		);
	}
	if (state === "done") {
		return (
			<WebPage url="spool.page/sign-in" title="Signed in" caption={caption}>
				<Title>You're in</Title>
				{pinned(true)}
				<Says>Passkey added. spool on this Mac is signed in, and you can close this tab.</Says>
				<button type="button" className={cn(PRIMARY, "self-start")} onClick={links["done-app"]}>
					Back to spool
					<ArrowRightIcon className="h-[12px] w-[12px]" />
				</button>
			</WebPage>
		);
	}
	if (state === "returning") {
		return (
			<WebPage url="spool.page/sign-in" title="Sign in" caption={caption}>
				<Title>Sign in to spool</Title>
				<Field label="Email address" placeholder="you@company.com" focus>
					<span className="absolute top-[74px] right-0 left-0 z-20 animate-menu-in rounded-[8px] border border-[#3A3A40] bg-[#2A2A2E] p-[4px] text-[#E6E6E8]">
						<button type="button" className="flex w-full items-center gap-[12px] rounded-[5px] bg-[#3A3A40] px-[10px] py-[8px] text-left" onClick={links["done-app"]}>
							<Key />
							<span className="flex flex-1 flex-col">
								<span className="type-control">ada@tidemark.app</span>
								<span className="text-[#9A9AA0] type-label">Passkey · spool.page</span>
							</span>
							<TouchId className="h-[18px] w-[18px] text-[#9A9AA0]" />
						</button>
						<span className="block px-[10px] py-[8px] text-[#9A9AA0] type-label">Use a passkey from another device</span>
					</span>
				</Field>
				<button type="button" className={cn(PRIMARY, WIDE, "opacity-50")}>
					Continue
				</button>
			</WebPage>
		);
	}
	return (
		<WebPage url="spool.page/sign-in" title="Sign in" caption={caption}>
			<Title>Sign in to spool</Title>
			<Says>One address, and spool picks the way in. A new address makes a new account on the way.</Says>
			<Field label="Email address" value="ada@tidemark.app" focus />
			<p className="-mt-[12px] flex items-center gap-[8px] text-muted type-label">
				<GoogleMark className="h-[12px] w-[12px]" />
				tidemark.app signs in with Google
			</p>
			<button type="button" className={cn(PRIMARY, WIDE)} onClick={links["passkey"]}>
				Continue with Google
			</button>
			<Small>
				Rather have a code?{" "}
				<button type="button" className="text-text underline decoration-border-raised underline-offset-4" onClick={links.code}>
					Email me one
				</button>
			</Small>
		</WebPage>
	);
}

function Key() {
	return (
		<svg viewBox="0 0 16 16" className="h-[16px] w-[16px] shrink-0 text-[#9A9AA0]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
			<circle cx="5.5" cy="8" r="3" />
			<path d="M8.5 8H14.5M12.5 8v2.5M14.5 8v2" strokeLinecap="round" />
		</svg>
	);
}

/* ── the app ───────────────────────────────────────────────── */

function EmailApp({ links, caption }: { links: Links<EmailFirstState>; caption: string }) {
	return (
		<AppHome
			switcher={<Switch mark={<OwnMark />} label="Your projects" open />}
			foot="On this Mac"
			caption={caption}
			overlay={
				<SwitchMenu width={300}>
					<MenuRow mark={<OwnMark />} label="Your projects" detail="2 on this Mac" checked />
					<MenuRule />
					<div className="px-[9px] pt-[8px] pb-[6px]">
						<p className="text-muted type-label">Teams and share links come with an account.</p>
						<button type="button" className={cn(BUTTON, "mt-[10px] w-full justify-start bg-surface")} onClick={links.page}>
							<span className="h-[8px] w-[8px] animate-pulse rounded-full bg-muted" />
							Finish in your browser
						</button>
						<div className="mt-[8px] flex justify-between text-muted type-detail">
							<button type="button" className="hover:text-text" onClick={links.page}>
								open the page again
							</button>
							<button type="button" className="hover:text-text">
								cancel
							</button>
						</div>
					</div>
				</SwitchMenu>
			}
		/>
	);
}

function EmailSignedIn({ caption }: { caption: string }) {
	return (
		<AppHome
			switcher={<Switch mark={<OwnMark />} label="Your projects" open />}
			foot="On this Mac"
			caption={caption}
			overlay={
				<>
					<SwitchMenu width={300}>
						<MenuRow mark={<OwnMark />} label="Your projects" detail="2 on this Mac" checked />
						<MenuRow mark={<MenuPlus />} label="New team…" />
						<MenuRule />
						<div className="px-[9px] pt-[8px] pb-[10px]">
							<Account />
						</div>
						<MenuRow label="This Mac" detail="signed in today" quiet />
						<MenuRow label="Passkeys and Macs" detail="spool.page ↗" quiet />
						<MenuRow label="Sign out" quiet />
					</SwitchMenu>
					<AppToast>Signed in as ada@tidemark.app</AppToast>
				</>
			}
		/>
	);
}
