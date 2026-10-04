import { PEOPLE, SHARES, type Share } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Faces as HereFaces, Host, Layout, member, NavItem, people, Search, TEAM, type TeamProject, TeamSwitch } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CloseIcon, FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { APP_SHARES, Caption, Faces, KindGlyph, LINK_URL, madeBy, Outsider, Pages, PROJECT, SmallButton, TextButton, type Who } from "./parts";

/**
 * Take three: sharing seen from outside the project, on the team's Home
 * (DEV-121's switcher and cover grid). A cover that anyone outside Tidemark can
 * open says so, and how widely, in a chip on its corner. Pressing the chip
 * opens a sheet over Home with every share of that project, without opening
 * the project or having it on this Mac.
 *
 * It bets that "who outside the team can see our work" is a question about
 * the team, asked across projects, more than one asked from inside a page.
 * spool.page/tidemark is the same Home, so a viewer in the browser gets the
 * same chip and the same sheet, read-only.
 */

export type HomeState = "base" | "manage" | "viewer";

/** How widely a project is shared, as its cover says it. */
function reach(project: string) {
	const shares = SHARES.filter((share) => share.project === project);
	if (shares.length === 0) return undefined;
	const named = new Set(shares.flatMap((share) => share.people ?? [])).size;
	const link = shares.some((share) => share.kind === "link");
	return named > 0 ? `shared with ${named}${link ? " + link" : ""}` : "shared by link";
}

export function SharesHome({ state = "base", onManage, onBack }: { state?: HomeState; onManage?: () => void; onBack?: () => void }) {
	const who: Who = state === "viewer" ? "lena" : "mira";
	const web = who === "lena";
	return (
		<Host host={web ? "web" : "app"} url="spool.page/tidemark">
			<Layout
				web={web}
				foot={web ? "lena.holm@gmail.com" : "On this Mac"}
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						<NavItem label="People" count={`${PEOPLE.length}`} />
					</>
				}
			>
				<header className="mb-[31px] flex items-center justify-between gap-[25px]">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						<Faces ids={PEOPLE.map((someone) => someone.id)} size={24} />
					</div>
					{web ? null : (
						<div className="flex items-center gap-[13px]">
							<Search placeholder="Search Tidemark" />
							<button type="button" className={HOME_ACTION_PRIMARY}>
								<PlusIcon className="h-[10px] w-[10px]" />
								New project…
							</button>
						</div>
					)}
				</header>
				<p className="mb-[24px] text-muted type-detail">{TEAM.length} projects</p>
				<div className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
					{TEAM.map((project) => (
						<Cover key={project.name} project={project} web={web} lit={project.name === PROJECT} />
					))}
				</div>
			</Layout>
			<Sheet who={who} stopping={state === "manage"} onBack={onBack} onStop={onManage} />
		</Host>
	);
}

/** Home's cover, with one more chip: who outside the team can open it. */
function Cover({ project, web, lit }: { project: TeamProject; web: boolean; lit: boolean }) {
	const away = !web && !project.onMac;
	const inside = people(project);
	const shared = reach(project.name);
	return (
		<article className={cn("min-w-0", lit && "relative z-40")}>
			<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
				<ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", away && "opacity-35 grayscale")} />
				{inside.length > 0 && (
					<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
						<HereFaces ids={inside} size={22} ring="border-bg" />
						<span className="type-detail">{inside.length === 1 ? `${member(inside[0]!).first} is here` : `${inside.length} here`}</span>
					</span>
				)}
				{shared === undefined ? null : (
					<button
						type="button"
						className={cn(
							"absolute top-[10px] right-[10px] flex h-[26px] cursor-pointer items-center gap-[7px] rounded-full border bg-bg px-[10px] type-detail transition-colors",
							lit ? "border-muted text-text" : "border-transparent text-text hover:border-border-raised",
						)}
					>
						<KindGlyph kind="people" className="h-3 w-3 text-muted" />
						{shared}
					</button>
				)}
				{away && (
					<span className="absolute inset-0 grid place-items-center">
						<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control">Get it</span>
					</span>
				)}
			</div>
			<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
				<strong className="truncate type-title font-[500]">{project.name}</strong>
				<span className="shrink-0 text-muted type-detail">{project.frames} frames</span>
			</div>
			<span className="mt-[6px] block text-muted type-detail">{away ? "not on this Mac yet" : project.edited}</span>
		</article>
	);
}

/**
 * Every share of tidemark app, over Home, in the invite sheet's idiom. It stands
 * to the right so the cover it came from stays lit beside it.
 */
function Sheet({ who, stopping, onBack, onStop }: { who: Who; stopping: boolean; onBack?: (() => void) | undefined; onStop?: (() => void) | undefined }) {
	const editor = who === "mira";
	return (
		<div className="absolute inset-0 z-30 flex items-start justify-end bg-[color-mix(in_oklab,var(--color-bg)_72%,transparent)] pt-[96px] pr-[48px]">
			<div className="w-[600px] rounded-[10px] border border-border-raised bg-surface">
				<div className="px-[26px] pt-[24px] pb-[18px]">
					<div className="mb-[6px] flex items-center justify-between">
						<h2 className="type-heading">Shared from tidemark app</h2>
						<button type="button" aria-label="Close" onClick={onBack} className="cursor-pointer text-muted hover:text-text">
							<CloseIcon className="h-[10px] w-[10px]" />
						</button>
					</div>
					<p className="text-muted type-control">
						{editor
							? "These belong to Tidemark, so any editor or admin can change or stop them, whoever made them."
							: "You can see who these pages are shared with. Editors and admins change them."}
					</p>
				</div>
				{APP_SHARES.map((share) => (
					<Row key={share.kind} share={share} who={who} stopping={stopping && share.kind === "link"} onStop={onStop} onBack={onBack} />
				))}
				{editor ? (
					<footer className="flex items-center justify-between border-border-raised border-t px-[26px] py-[16px]">
						<span className="text-muted type-control">Pages are shared from inside the project.</span>
						<button type="button" className={HOME_ACTION}>
							Open tidemark app
						</button>
					</footer>
				) : null}
			</div>
			<Caption left={232}>
				{stopping
					? "Home, stopping Jonas's link. Mira can, because the team owns it, and the sheet says what stopping does before it happens."
					: who === "lena"
						? "Home in the browser, as a viewer. The chip and the sheet are the same, and the sheet has no verbs."
						: "Home. A cover says who outside Tidemark can open it, and pressing that lists every share without opening the project."}
			</Caption>
		</div>
	);
}

function Row({
	share,
	who,
	stopping,
	onStop,
	onBack,
}: {
	share: Share;
	who: Who;
	stopping: boolean;
	onStop?: (() => void) | undefined;
	onBack?: (() => void) | undefined;
}) {
	const editor = who === "mira";
	return (
		<div className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-[14px] border-border-raised border-t px-[26px] py-[18px]">
			<span className="grid h-[28px] w-[28px] place-items-center rounded-full border border-border-raised text-muted">
				<KindGlyph kind={share.kind} className="h-3.5 w-3.5" />
			</span>
			<div className="flex min-w-0 flex-col gap-[10px]">
				<div className="flex items-center gap-[10px]">
					<span className="type-control">{share.kind === "people" ? "Invited people" : "Anyone with the link"}</span>
					<Pages names={share.pages} />
				</div>
				{share.kind === "people" ? (
					<ul className="flex flex-col gap-[8px]">
						{(share.people ?? []).map((email) => (
							<li key={email} className="flex items-center gap-[9px] type-detail">
								<Outsider email={email} size={20} />
								{email}
							</li>
						))}
					</ul>
				) : (
					<span className={cn("type-detail", editor ? "text-text" : "text-muted")}>{editor ? LINK_URL : "anyone who has the link, no sign-in"}</span>
				)}
				{stopping ? (
					<div className="mt-[4px] flex flex-col gap-[10px] rounded-[7px] border border-border-raised bg-bg p-[14px]">
						<p className="type-control">Stop this link?</p>
						<p className="text-muted type-control">
							It stops working at once, for everyone who has it. onboarding and receipt stay in tidemark app as they are, and sharing them again makes a new link.
						</p>
						<div className="flex justify-end gap-1.5">
							<SmallButton onClick={onBack}>Keep</SmallButton>
							<SmallButton primary onClick={onBack}>
								Stop link
							</SmallButton>
						</div>
					</div>
				) : null}
			</div>
			<div className="flex flex-col items-end gap-[6px]">
				<span className="text-muted type-detail">{madeBy(share, who)}</span>
				<span className="text-muted type-detail">{share.opens} opens</span>
				{editor && !stopping ? (
					<span className="mt-[6px] flex gap-[14px]">
						<TextButton>{share.kind === "people" ? "Add someone" : "Copy"}</TextButton>
						<TextButton danger onClick={share.kind === "link" ? onStop : undefined}>
							Stop
						</TextButton>
					</span>
				) : null}
			</div>
		</div>
	);
}
