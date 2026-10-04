import type { ReactNode } from "react";
import { PEOPLE, person, TEAM_NAME } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Faces, Layout, NavItem, TEAM, TeamMark, TeamSwitch } from "shared/ui/explore/cloud/home/parts";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { ArrowRightIcon, FrameIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { BUTTON, Caption, Field, GoogleMark, type Links, Or, PRIMARY, Says, Small, Title, WebPage, WIDE } from "./parts";

/**
 * The invite, walked once: Noor, invited by Jonas as an editor to
 * noor@tidemark.app. It starts in her mail and ends with Tidemark joined. The
 * page is the sign-in column with the address fixed, so the invite and the
 * rule that only that address can accept it are one thing on screen.
 */

export type WalkState = "email" | "page" | "wrong" | "expired" | "joined" | "joined-viewer";

export const INVITED = "noor@tidemark.app";
export const OTHER = "noor.k@gmail.com";
const JONAS = person("jonas");
const URL = "spool.page/invite/7kq2mx";
/** ROLE_SAYS.editor, said to the person rather than about them */
const EDITOR = "Editors keep Tidemark's projects on their Mac, and what they save reaches the rest of the team.";

const SAYS: Record<WalkState, string> = {
	email: "The invite as it lands. Who, which team, what the role means in one sentence, when it runs out, one button.",
	page: "The invite page is the sign-in page with the address fixed. Either way in works, for this one address.",
	wrong: "Signed in as another address, the page says who the invite is for and offers two ways forward.",
	expired: "After 7 days the page names who can send a new one, so there is somebody to ask.",
	joined: "An editor's next step is spool on the Mac. What happens there is another ticket.",
	"joined-viewer": "What a viewer gets instead: straight onto the team's page, every project live in the browser.",
};

export function InviteWalk({ state = "page", links = {} }: { state?: WalkState; links?: Links<WalkState> }) {
	const caption = SAYS[state];
	if (state === "email") return <Mail caption={caption} onJoin={links.page} />;
	if (state === "joined-viewer") return <ViewerLanding caption={caption} />;

	if (state === "wrong") {
		return (
			<WebPage url={URL} title="Join Tidemark" head={<TeamHead />} caption={caption} sibling="Mail">
				<Title>This invite is for {INVITED}</Title>
				<div className="flex items-center gap-[10px] rounded-[7px] border border-border px-[12px] py-[10px]">
					<NoorFace />
					<span className="flex-1 type-control">
						You're signed in as <span className="text-text">{OTHER}</span>
					</span>
				</div>
				<button type="button" className={cn(PRIMARY, WIDE)} onClick={links.page}>
					Sign in as {INVITED}
				</button>
				<div className="flex flex-col gap-[12px] border-border border-t pt-[24px]">
					<Says>
						Rather join as {OTHER}? Ask {JONAS.name} to send the invite to that address. An invite only opens for the address it went to.
					</Says>
					<button type="button" className={cn(BUTTON, "self-start")}>
						Email Jonas
					</button>
				</div>
			</WebPage>
		);
	}
	if (state === "expired") {
		return (
			<WebPage url={URL} title="Invite ended" head={<TeamHead />} caption={caption} sibling="Mail">
				<Title>This invite has run out</Title>
				<Says>
					{JONAS.name} invited {INVITED} on 2 October. Invites last 7 days, so this one ended on 9 October. Any Tidemark admin can send a new one.
				</Says>
				<ul className="flex flex-col border-border border-y">
					{PEOPLE.filter((item) => item.role === "admin")
						.sort((a) => (a.id === "jonas" ? -1 : 1))
						.map((admin) => (
						<li key={admin.id} className="flex h-[52px] items-center gap-[12px] border-border not-last:border-b">
							<FixtureFace id={admin.id} />
							<span className="flex flex-1 flex-col">
								<span className="type-control">{admin.name}</span>
								<span className="text-muted type-detail">{admin.email}</span>
							</span>
							<button type="button" className={BUTTON}>
								Ask {admin.name.split(" ")[0]}
							</button>
						</li>
					))}
				</ul>
				<Small>Asking opens an email to them with this invite's details filled in.</Small>
			</WebPage>
		);
	}
	if (state === "joined") {
		return (
			<WebPage url="spool.page/tidemark/welcome" title="Tidemark" head={<TeamHead />} caption={caption} sibling="Mail">
				<Title>You're in Tidemark</Title>
				<div className="flex items-center gap-[12px]">
					<span className="flex">
						<FixtureFaces ids={PEOPLE.map((item) => item.id)} />
						<span className="-ml-[6px]">
							<NoorFace />
						</span>
					</span>
					<span className="text-muted type-control">with Ada, Jonas, Mira, Sam and Lena</span>
				</div>
				<Says>As an editor you work on Tidemark's projects in spool on your Mac. Open it there, signed in as {INVITED}, and Tidemark is waiting in the switcher.</Says>
				<div className="flex gap-[10px]">
					<button type="button" className={PRIMARY}>
						Open spool
						<ArrowRightIcon className="h-[12px] w-[12px]" />
					</button>
					<button type="button" className={BUTTON}>
						Get spool for Mac
					</button>
				</div>
				<Small>Tidemark's page at spool.page/tidemark works in the browser too, any time.</Small>
			</WebPage>
		);
	}
	return (
		<WebPage url={URL} title="Join Tidemark" head={<TeamHead />} caption={caption} sibling="Mail">
			<Title>Join Tidemark</Title>
			<Says>
				{JONAS.name} invited you as an editor. {EDITOR}
			</Says>
			<Field label="Invited address" value={INVITED} fixed />
			<button type="button" className={cn(BUTTON, WIDE)} onClick={links.joined}>
				<GoogleMark />
				Continue with Google
			</button>
			<Or />
			<button type="button" className={cn(PRIMARY, WIDE)} onClick={links.joined}>
				Email a code to {INVITED}
			</button>
			<Small>The invite lasts until 9 October.</Small>
		</WebPage>
	);
}

/* ── pieces ────────────────────────────────────────────────── */

function TeamHead() {
	return (
		<p className="flex items-center gap-[10px] type-title">
			<TeamMark size={24} />
			{TEAM_NAME}
			<span className="flex items-center gap-[6px] text-muted type-label">
				on
				<SpoolMark className="h-[13px] w-[10px] text-thread" />
				spool
			</span>
		</p>
	);
}

export function FixtureFace({ id, size = 28 }: { id: string; size?: number }) {
	const item = person(id);
	return (
		<span
			className="inline-grid shrink-0 place-items-center rounded-full border-2 border-bg font-medium text-[#151515]"
			style={{ background: item.hue, width: size, height: size, fontSize: Math.round(size * 0.36) }}
			title={item.name}
		>
			{item.initials}
		</span>
	);
}

function FixtureFaces({ ids }: { ids: string[] }) {
	return (
		<span className="flex">
			{ids.map((id, index) => (
				<span key={id} style={{ marginLeft: index === 0 ? 0 : -6 }}>
					<FixtureFace id={id} />
				</span>
			))}
		</span>
	);
}

function NoorFace({ size = 28 }: { size?: number }) {
	return (
		<span
			className="inline-grid shrink-0 place-items-center rounded-full border-2 border-bg font-medium text-[#151515]"
			style={{ background: "#7FC4B8", width: size, height: size, fontSize: Math.round(size * 0.36) }}
		>
			NA
		</span>
	);
}

/* ── the mail ──────────────────────────────────────────────── */

const INBOX = [
	{ from: "spool", subject: "Jonas Berg invited you to Tidemark", when: "09:12", open: true },
	{ from: "Jonas Berg", subject: "Welcome aboard, first week plan", when: "08:40" },
	{ from: "Tidemark Ops", subject: "Your laptop is on its way", when: "Yesterday" },
	{ from: "Mira Koskinen", subject: "Checkout notes before Thursday", when: "Yesterday" },
	{ from: "Calendar", subject: "Tidemark onboarding, Monday 10:00", when: "Tuesday" },
];

/**
 * A plain mail client, nobody's in particular, in OS grey. The message is
 * spool's own email, drawn in spool's tokens inside it.
 */
function Mail({ caption, onJoin }: { caption: string; onJoin?: (() => void) | undefined }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-[#1E1E21] font-sans text-[#E6E6E8] antialiased">
			<div className="flex h-[52px] shrink-0 items-center gap-[8px] border-[#2C2C30] border-b px-[18px]">
				{["#FF5F57", "#FEBC2E", "#28C840"].map((hue) => (
					<span key={hue} className="h-[12px] w-[12px] rounded-full" style={{ background: hue }} />
				))}
				<span className="ml-[24px] type-title">Inbox</span>
				<span className="ml-[8px] text-[#8E8E93] type-label">noor@tidemark.app</span>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)]">
				<ul className="flex flex-col border-[#2C2C30] border-r">
					{INBOX.map((item) => (
						<li key={item.subject} className={cn("flex flex-col gap-[2px] border-[#2C2C30] border-b px-[20px] py-[14px]", item.open && "bg-[#2E3A52]")}>
							<span className="flex items-baseline justify-between">
								<span className="type-title">{item.from}</span>
								<span className="text-[#8E8E93] type-label">{item.when}</span>
							</span>
							<span className="truncate text-[#C8C8CC] type-control">{item.subject}</span>
						</li>
					))}
				</ul>
				<section className="min-h-0 overflow-hidden">
					<header className="border-[#2C2C30] border-b px-[40px] py-[22px]">
						<p className="type-heading">Jonas Berg invited you to Tidemark</p>
						<p className="mt-[6px] text-[#8E8E93] type-control">spool &lt;invites@spool.page&gt; to noor@tidemark.app · Thursday 2 October, 09:12</p>
					</header>
					<div className="flex justify-center px-[40px] pt-[56px]">
						<article className="flex w-[480px] flex-col gap-[20px] rounded-[10px] bg-bg p-[40px] text-text">
							<p className="flex items-center gap-[8px] type-title">
								<SpoolMark className="h-[18px] w-[14px] text-thread" />
								spool
							</p>
							<p className="type-heading">Jonas Berg invited you to join Tidemark as an editor.</p>
							<p className="text-muted type-body">{EDITOR} Tidemark has five people and four projects so far.</p>
							<button type="button" className={cn(PRIMARY, "h-[40px] self-start px-[18px]")} onClick={onJoin}>
								Join Tidemark
							</button>
							<p className="text-muted type-label">
								This invite is for noor@tidemark.app and lasts until 9 October. If you weren't expecting it, you can leave it be.
							</p>
						</article>
					</div>
				</section>
			</div>
			<Caption text={caption} />
		</div>
	);
}

/* ── a viewer lands on the team's page ─────────────────────── */

function ViewerLanding({ caption }: { caption: string }) {
	return (
		<PlayedTab title="Tidemark · spool" url="spool.page/tidemark" sibling="Mail">
			<div className="relative h-full bg-bg text-text">
				<Layout
					web
					nav={
						<>
							<TeamSwitch />
							<div className="h-[18px]" />
							<NavItem icon={<FrameIcon />} label="Projects" current />
							<NavItem label="People" count="6" />
						</>
					}
					foot={INVITED}
				>
					<header className="mb-[22px] flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						<Faces ids={["ada", "jonas", "mira", "sam"]} />
					</header>
					<p className="mb-[28px] flex items-center gap-[10px] border-border border-b pb-[18px] text-muted type-control">
						<span className="h-[7px] w-[7px] rounded-full bg-thread" />
						You joined Tidemark as a viewer. Open any project to watch it live, with everyone else in it.
					</p>
					<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
						{TEAM.map((project) => (
							<ViewerTile key={project.name} name={project.name} frames={project.frames} edited={project.edited} here={[...new Set(project.here.map((item) => item.who))]}>
								<ProjectArtwork kind={project.art} className="h-full w-full object-cover object-top" />
							</ViewerTile>
						))}
					</div>
				</Layout>
				<Caption text={caption} left={256} />
			</div>
		</PlayedTab>
	);
}

function ViewerTile({ name, frames, edited, here, children }: { name: string; frames: number; edited: string; here: string[]; children: ReactNode }) {
	return (
		<article className="min-w-0">
			<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
				{children}
				{here.length > 0 && (
					<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
						<Faces ids={here} size={22} />
						<span className="type-detail">{here.length === 1 ? `${here[0]} is here` : `${here.length} here`}</span>
					</span>
				)}
			</div>
			<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
				<strong className="truncate type-title font-[500]">{name}</strong>
				<span className="shrink-0 text-muted type-detail">{frames} frames</span>
			</div>
			<span className="mt-[6px] block text-muted type-detail">{edited}</span>
		</article>
	);
}
