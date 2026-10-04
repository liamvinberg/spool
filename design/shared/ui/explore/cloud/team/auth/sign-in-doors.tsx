import { cn } from "shared/lib/utils";
import { ArrowRightIcon, ChevronIcon } from "shared/ui/spool/icons";
import {
	Account,
	AppHome,
	AppToast,
	BUTTON,
	CodeBoxes,
	Field,
	GoogleMark,
	type Links,
	MenuRow,
	MenuRule,
	Or,
	OwnMark,
	PasskeySheet,
	PRIMARY,
	Says,
	Small,
	Switch,
	Title,
	TouchId,
	WebPage,
	WIDE,
} from "./parts";

/**
 * Take one: two doors. One page offers Google and an email field that sends a
 * six-digit code, side by side, the way the sharing beta's 400px column already
 * reads. Every step is its own page. In the app, signing in lives at the foot of
 * Home's sidebar, which is where your account stays once you are in.
 *
 * Bets that two visible ways in cost less than any guessing on spool's side.
 */

export type DoorsState = "app" | "page" | "code" | "passkey" | "done" | "done-app" | "returning";

const SAYS: Record<DoorsState, string> = {
	app: "Two doors. Sign in sits at the foot of Home, where your account will live, and the app waits there while the browser is open.",
	page: "Two doors. Google and a code side by side on one page, so nobody has to guess which one spool wants.",
	code: "Two doors. The code is its own page, and it says where it went and how long it lasts.",
	passkey: "Two doors. The passkey is offered once, straight after a first sign-in, and Not now costs nothing.",
	done: "Two doors. The browser's last job is to send you back.",
	"done-app": "Two doors. Your account lives at the foot of the sidebar, and so do this Mac and signing out.",
	returning: "Two doors. With a passkey on this Mac the page leads with Touch ID, one press.",
};

export function SignInDoors({ state = "page", links = {} }: { state?: DoorsState; links?: Links<DoorsState> }) {
	const caption = SAYS[state];
	if (state === "app") return <DoorsApp links={links} caption={caption} />;
	if (state === "done-app") return <DoorsSignedIn caption={caption} />;
	if (state === "code") {
		return (
			<WebPage url="spool.page/sign-in/code" title="Check your email" caption={caption}>
				<Title>Check your email</Title>
				<Says>
					We sent a six-digit code to <span className="text-text">ada@tidemark.app</span>. Type it here, even if you read the email on your phone.
				</Says>
				<button type="button" className="block text-left" onClick={links.passkey}>
					<CodeBoxes typed={4} />
				</button>
				<Small>The code works for 10 minutes.</Small>
				<div className="flex items-center gap-[20px] type-control">
					<button type="button" className="underline decoration-border-raised underline-offset-4">
						Send a new code
					</button>
					<button type="button" className="underline decoration-border-raised underline-offset-4" onClick={links.page}>
						Use another address
					</button>
				</div>
			</WebPage>
		);
	}
	if (state === "passkey") {
		return (
			<WebPage url="spool.page/sign-in/passkey" title="Add a passkey" caption={caption}>
				<TouchId className="h-[44px] w-[44px] text-thread" />
				<Title>Skip the email next time</Title>
				<Says>Add a passkey and this Mac signs you in with Touch ID. It is kept in your keychain, and you can remove it from your account page.</Says>
				<div className="flex gap-[10px]">
					<button type="button" className={PRIMARY} onClick={links.done}>
						Add a passkey
					</button>
					<button type="button" className={BUTTON} onClick={links.done}>
						Not now
					</button>
				</div>
				<Small>Signed in as ada@tidemark.app</Small>
			</WebPage>
		);
	}
	if (state === "done") {
		return (
			<WebPage url="spool.page/sign-in/done" title="Signed in" caption={caption}>
				<Title>You're signed in</Title>
				<Says>spool on this Mac is signed in as ada@tidemark.app. You can close this tab.</Says>
				<button type="button" className={cn(PRIMARY, "self-start")} onClick={links["done-app"]}>
					Open spool
					<ArrowRightIcon className="h-[12px] w-[12px]" />
				</button>
				<Small>If spool didn't come to the front, Open spool brings it back.</Small>
			</WebPage>
		);
	}
	if (state === "returning") {
		return (
			<WebPage url="spool.page/sign-in" title="Sign in" caption={caption} overlay={<PasskeySheet email="ada@tidemark.app" />}>
				<Title>Welcome back, Ada</Title>
				<button type="button" className={cn(PRIMARY, WIDE)} onClick={links["done-app"]}>
					<TouchId className="h-[16px] w-[16px]" />
					Sign in with Touch ID
				</button>
				<Or />
				<button type="button" className={cn(BUTTON, WIDE)}>
					<GoogleMark />
					Continue with Google
				</button>
				<button type="button" className={cn(BUTTON, WIDE)}>
					Email me a code
				</button>
				<Small>Not Ada? Use either of the other two with your own address.</Small>
			</WebPage>
		);
	}
	return (
		<WebPage url="spool.page/sign-in" title="Sign in" caption={caption}>
			<Title>Sign in to spool</Title>
			<Says>spool on your Mac picks up as soon as you're in. A new address makes a new account on the way.</Says>
			<button type="button" className={cn(BUTTON, WIDE)} onClick={links.passkey}>
				<GoogleMark />
				Continue with Google
			</button>
			<Or />
			<Field label="Email address" value="ada@tidemark.app" focus />
			<button type="button" className={cn(PRIMARY, WIDE)} onClick={links.code}>
				Email me a code
			</button>
		</WebPage>
	);
}

/* ── the app ───────────────────────────────────────────────── */

const own = <Switch mark={<OwnMark />} label="Your projects" />;

function DoorsApp({ links, caption }: { links: Links<DoorsState>; caption: string }) {
	return (
		<AppHome
			switcher={own}
			caption={caption}
			foot={
				<div className="-ml-[12px] flex flex-col gap-[10px]">
					<p className="pl-[2px] font-sans text-muted type-label">Sign in to share links and join a team.</p>
					<button type="button" className={cn(BUTTON, "w-full justify-start bg-raised")} onClick={links.page}>
						<span className="h-[8px] w-[8px] animate-pulse rounded-full bg-muted" />
						Waiting for the browser
					</button>
				</div>
			}
			overlay={
				<div className="absolute bottom-[148px] left-[16px] z-30 w-[300px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[16px]">
					<p className="type-title">Finish in your browser</p>
					<p className="mt-[6px] text-muted type-control">spool.page is open in Chrome. This comes back by itself once you're in.</p>
					<div className="mt-[14px] flex gap-[8px]">
						<button type="button" className={BUTTON} onClick={links.page}>
							Open it again
						</button>
						<button type="button" className={BUTTON}>
							Cancel
						</button>
					</div>
				</div>
			}
		/>
	);
}

function DoorsSignedIn({ caption }: { caption: string }) {
	return (
		<AppHome
			switcher={own}
			caption={caption}
			foot={
				<button type="button" className="-ml-[12px] flex w-[176px] items-center gap-[8px] rounded-[7px] bg-surface px-[8px] py-[6px] text-left">
					<Account compact />
					<ChevronIcon className="ml-auto h-[10px] w-[10px] -rotate-90 text-muted" />
				</button>
			}
			overlay={
				<>
					<div className="absolute bottom-[70px] left-[16px] z-30 w-[290px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]">
						<div className="px-[9px] pt-[8px] pb-[10px]">
							<Account />
						</div>
						<MenuRule />
						<MenuRow label="This Mac" detail="signed in today" />
						<MenuRow label="Passkeys and Macs" detail="spool.page ↗" />
						<MenuRule />
						<MenuRow label="Sign out of this Mac" />
					</div>
					<AppToast>Signed in as ada@tidemark.app</AppToast>
				</>
			}
		/>
	);
}
