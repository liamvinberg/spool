import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CloseIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { Count, Faces, Grid, Host, InviteField, Layout, MEMBERS, NavItem, PeopleList, Search, TEAM, TeamMark, TeamSwitch } from "./parts";
import { SpaceTake } from "./space";
import { FacesTake } from "./faces";
import { NowTake } from "./now";

/**
 * DEV-121: where a team lives, in the app and in the browser.
 *
 * Takes go down, smallest change to Home first:
 *   section  the team is a section of Home's sidebar; the browser is a list that hands you to the app
 *   same     a team switcher scopes Home, and spool.page shows the same Home
 *   faces    no team page: covers say who is inside, people live in the project, links open the app
 *   now      the team's Home is what is happening, people and agents, live
 *   space    Home is a canvas of projects, the team resting on the ones they are in
 *
 * States go across: the app, the browser, inviting someone.
 *
 * A team project is a folder on every member's Mac (DEV-112), so the app opens it
 * like any project and the browser can only look. Getting a team project onto a
 * new Mac is fog on the map, so "Get it" is drawn and goes nowhere.
 */

export type TeamTake = "section" | "same" | "faces" | "now" | "space";
export type TeamState = "app" | "web" | "invite";

export interface TeamWalks {
	onOpen?: (() => void) | undefined;
	onInvite?: (() => void) | undefined;
	onWeb?: (() => void) | undefined;
}

export function TeamHome({ take, state, ...walks }: { take: TeamTake; state: TeamState } & TeamWalks) {
	if (take === "faces") return <FacesTake state={state} {...walks} />;
	if (take === "now") return <NowTake state={state} {...walks} />;
	if (take === "space") return <SpaceTake state={state} {...walks} />;
	if (take === "section") return <Section state={state} {...walks} />;
	return <Same state={state} {...walks} />;
}

/* ── section ───────────────────────────────────────────────── */

function Section({ state, onOpen, onInvite }: { state: TeamState } & TeamWalks) {
	if (state === "web")
		return (
			<Host host="web">
				<SectionDoor />
			</Host>
		);
	return (
		<Host host="app">
			<Layout
				nav={
					<>
						<NavItem icon={<FrameIcon />} label="Projects" />
						<div className="mt-[26px] mb-[6px] flex items-center gap-[10px] px-[12px]">
							<TeamMark />
							<span className="type-control">Tidemark</span>
						</div>
						<NavItem label="Projects" indent current />
						<NavItem label="People" indent count="4" />
					</>
				}
				foot="On this Mac"
			>
				<header className="mb-[31px] flex items-center justify-between gap-[25px]">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Tidemark</h1>
						<Faces ids={MEMBERS.map((person) => person.id)} />
					</div>
					<div className="flex items-center gap-[13px]">
						<Search placeholder="Search Tidemark" />
						<button type="button" className={HOME_ACTION} onClick={onInvite}>
							Invite
						</button>
						<button type="button" className={HOME_ACTION_PRIMARY}>
							<PlusIcon className="h-[10px] w-[10px]" />
							New team project…
						</button>
					</div>
				</header>
				<Count n={TEAM.length} />
				<Grid projects={TEAM} onOpen={onOpen} />
			</Layout>
			{state === "invite" && <InviteSheet />}
		</Host>
	);
}

function SectionDoor() {
	return (
		<div className="flex h-full justify-center overflow-hidden px-[48px] pt-[92px]">
			<div className="w-[560px]">
				<div className="mb-[44px] flex items-center gap-[10px] [font:var(--type-mark)] tracking-[-1px]">
					<SpoolMark className="h-[25px] w-[19px] text-thread" />
					<span>spool</span>
				</div>
				<div className="flex items-center gap-[12px]">
					<TeamMark size={32} />
					<h1 className="type-page">Tidemark</h1>
				</div>
				<p className="mt-[14px] text-muted [font:var(--type-body)]">Tidemark's projects open in spool on your Mac. Here you can look at one without opening it.</p>
				<ul className="mt-[34px] border-border border-t">
					{TEAM.map((project) => (
						<li key={project.name} className="flex h-[64px] items-center gap-[16px] border-border border-b">
							<div className="h-[40px] w-[72px] shrink-0 overflow-hidden rounded-[5px] bg-canvas">
								<ProjectArtwork kind={project.art} className="h-full w-full object-cover object-top" />
							</div>
							<div className="min-w-0 flex-1">
								<strong className="block truncate type-title font-[500]">{project.name}</strong>
								<span className="text-muted type-detail">
									{project.frames} frames · {project.edited}
								</span>
							</div>
							<button type="button" className="px-[8px] text-muted type-control hover:text-text">
								Look
							</button>
							<button type="button" className={HOME_ACTION}>
								Open in spool
							</button>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

/* ── same ──────────────────────────────────────────────────── */

function Same({ state, onOpen, onInvite }: { state: TeamState } & TeamWalks) {
	const web = state === "web";
	return (
		<Host host={web ? "web" : "app"}>
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						<NavItem label="People" count="4" />
					</>
				}
				foot={web ? "ada@tidemark.app" : "On this Mac"}
				web={web}
			>
				<header className="mb-[31px] flex items-center justify-between gap-[25px]">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						<Faces ids={MEMBERS.map((person) => person.id)} />
					</div>
					<div className="flex items-center gap-[13px]">
						<Search placeholder="Search Tidemark" />
						<button type="button" className={HOME_ACTION} onClick={onInvite}>
							Invite
						</button>
						{!web && (
							<button type="button" className={HOME_ACTION_PRIMARY}>
								<PlusIcon className="h-[10px] w-[10px]" />
								New project…
							</button>
						)}
					</div>
				</header>
				<Count n={TEAM.length} />
				<Grid projects={TEAM} onOpen={onOpen} web={web} />
			</Layout>
			{state === "invite" && <InviteSheet />}
		</Host>
	);
}

function InviteSheet() {
	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-[color-mix(in_oklab,var(--color-bg)_72%,transparent)] pt-[110px]">
			<div className="w-[500px] rounded-[10px] border border-border-raised bg-surface p-[26px]">
				<div className="mb-[6px] flex items-center justify-between">
					<h2 className="type-heading">Invite to Tidemark</h2>
					<CloseIcon className="h-[10px] w-[10px] text-muted" />
				</div>
				<p className="mb-[22px] text-muted type-control">They can open and change every Tidemark project.</p>
				<InviteField />
				<div className="mt-[22px] border-border-raised border-t pt-[8px]">
					<PeopleList />
				</div>
			</div>
		</div>
	);
}
