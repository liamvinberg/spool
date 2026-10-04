import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { AgentIcon, FrameIcon } from "shared/ui/spool/icons";
import { Faces, Host, Layout, NavItem, TEAM, TeamSwitch, member, type TeamProject } from "./parts";
import type { TeamWalks } from "./team-home";

/**
 * page, now: the team's Home is what is happening.
 *
 * A team canvas is live, so its Home can be too. Projects with someone in them
 * come first and say who, on which frame, and what their agents are doing, in
 * the same mono status lines the canvas already speaks. Quiet projects fold into
 * a list under them.
 */
export function PageNow({ onOpen, onInvite }: TeamWalks) {
	const web = false;
	const live = TEAM.filter((project) => project.here.length > 0);
	const quiet = TEAM.filter((project) => project.here.length === 0);
	return (
		<Host host="app">
			<Layout
				nav={
					<>
						<TeamSwitch />
						<div className="h-[18px]" />
						<NavItem icon={<FrameIcon />} label="Projects" current />
						<NavItem label="People" count="4" />
					</>
				}
				foot="On this Mac"
			>
				<header className="mb-[30px] flex items-center justify-between">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						<span className="flex items-center gap-[8px] text-muted type-detail">
							<span className="h-[6px] w-[6px] animate-pulse rounded-full bg-thread" />3 people in now
						</span>
					</div>
					<button type="button" className={HOME_ACTION} onClick={onInvite}>
						Invite
					</button>
				</header>

				<div className="flex flex-col gap-[14px]">
					{live.map((project) => (
						<LiveRow key={project.name} project={project} web={web} onOpen={onOpen} />
					))}
				</div>

				<p className="mt-[36px] mb-[6px] text-muted type-detail">quiet</p>
				<ul className="border-border border-t">
					{quiet.map((project) => (
						<li key={project.name} className="flex h-[52px] items-center gap-[16px] border-border border-b">
							<span className="h-[30px] w-[54px] shrink-0 overflow-hidden rounded-[4px] bg-canvas">
								<ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", !project.onMac && !web && "opacity-35 grayscale")} />
							</span>
							<span className="w-[200px] type-control">{project.name}</span>
							<span className="flex-1 text-muted type-detail">{!project.onMac && !web ? "not on this Mac yet" : project.edited}</span>
							<span className="text-muted type-detail">{project.frames} frames</span>
							<button type="button" className="w-[110px] text-right text-muted type-control hover:text-text" onClick={project.onMac && !web ? onOpen : undefined}>
								{web ? "Look" : project.onMac ? "Open" : "Get it"}
							</button>
						</li>
					))}
				</ul>
			</Layout>
		</Host>
	);
}

function LiveRow({ project, web, onOpen }: { project: TeamProject; web: boolean; onOpen?: (() => void) | undefined }) {
	return (
		<article className="flex gap-[24px] rounded-[10px] border border-border p-[14px] hover:border-border-raised">
			<div className="relative aspect-[1.82] w-[300px] shrink-0 overflow-hidden rounded-[6px] bg-canvas">
				<ProjectArtwork kind={project.art} className="h-full w-full object-cover object-top" />
			</div>
			<div className="flex min-w-0 flex-1 flex-col py-[4px]">
				<div className="flex items-baseline justify-between">
					<strong className="type-title font-[500]">{project.name}</strong>
					<span className="text-muted type-detail">{project.frames} frames</span>
				</div>
				<ul className="mt-[16px] flex flex-col gap-[9px]">
					{project.here.map((presence) => (
						<li key={presence.who + presence.on} className="flex items-center gap-[10px] type-value">
							{presence.agent ? (
								<span className="grid h-[20px] w-[20px] place-items-center rounded-full border" style={{ borderColor: member(presence.who).hue, color: member(presence.who).hue }}>
									<AgentIcon className="h-[11px] w-[11px]" />
								</span>
							) : (
								<Faces ids={[presence.who]} size={20} />
							)}
							<span className="text-text">{presence.agent ? `${member(presence.who).first}'s agent` : member(presence.who).first}</span>
							<span className="text-muted">{presence.agent ? presence.on : `on ${presence.on}`}</span>
							{presence.agent && <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-thread" />}
						</li>
					))}
				</ul>
				<div className="mt-auto flex items-center justify-between pt-[16px]">
					<span className="text-muted type-detail">{project.today}</span>
					<div className="flex items-center gap-[10px]">
						{web && (
							<button type="button" className="px-[8px] text-muted type-control hover:text-text">
								Look
							</button>
						)}
						<button type="button" className={web ? HOME_ACTION : HOME_ACTION_PRIMARY} onClick={onOpen}>
							{web ? "Open in spool" : "Open"}
						</button>
					</div>
				</div>
			</div>
		</article>
	);
}
