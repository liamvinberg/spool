import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { PlusIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { Cursor, Faces, Host, InviteField, MEMBERS, OWN, PeopleList, TEAM, TeamMark, type TeamProject } from "./parts";
import type { TeamState, TeamWalks } from "./team-home";

/**
 * space: Home is a canvas.
 *
 * spool already teaches one surface, so Home borrows it. Every project is a
 * frame-sized cover on a field, labelled the way frames are, and the team's
 * people rest their pointers on the project they are in, the same pointers they
 * have inside it. Tidemark is a region of the field with its own label, and its
 * people and invite hang off that label. Your own projects sit in their own
 * region beside it. The browser shows the team's region alone.
 */

const W = 300;
const H = 165;

export function SpaceTake({ state, onOpen, onInvite }: { state: TeamState } & TeamWalks) {
	const web = state === "web";
	return (
		<Host host={web ? "web" : "app"}>
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] bg-bg text-text">
				<Rail web={web} />
				<div className="relative overflow-hidden bg-canvas bg-[radial-gradient(circle,color-mix(in_oklab,var(--color-muted)_22%,transparent)_1px,transparent_1px)] bg-[length:24px_24px]">
					<Region x={web ? 150 : 72} y={72} onInvite={onInvite}>
						{TEAM.map((project, index) => (
							<Cover key={project.name} project={project} x={(index % 2) * (W + 40)} y={Math.floor(index / 2) * (H + 64)} web={web} onOpen={onOpen} />
						))}
						<Cursor id="jonas" x={196} y={96} />
						<Cursor id="mira" x={118} y={34} />
						<Cursor id="sam" x={W + 40 + 150} y={60} />
					</Region>
					{!web && (
						<div className="absolute" style={{ left: 72 + 2 * W + 40 + 96, top: 72 }}>
							<p className="mb-[16px] text-muted type-value">your projects</p>
							<div className="relative" style={{ width: W, height: 2 * H + 64 }}>
								{OWN.map((project, index) => (
									<Cover key={project.name} project={project} x={0} y={index * (H + 64)} web={false} onOpen={onOpen} />
								))}
							</div>
						</div>
					)}
					<div className="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-[4px] rounded-[9px] border border-border-raised bg-bg p-[4px]">
						{!web && (
							<button type="button" className="flex h-[30px] items-center gap-[8px] rounded-[6px] px-[12px] type-control hover:bg-surface">
								<PlusIcon className="h-[10px] w-[10px]" />
								New project
							</button>
						)}
						<span className="px-[10px] text-muted type-detail">62%</span>
					</div>
					{state === "invite" && (
						<div className="absolute z-30 w-[380px] rounded-[10px] border border-border-raised bg-surface p-[20px]" style={{ left: 72 + 196, top: 104 }}>
							<p className="type-title font-[500]">Invite to Tidemark</p>
							<p className="mt-[4px] mb-[16px] text-muted type-control">They can open and change every Tidemark project.</p>
							<InviteField />
							<div className="mt-[14px] border-border-raised border-t pt-[6px]">
								<PeopleList where />
							</div>
						</div>
					)}
				</div>
			</div>
		</Host>
	);
}

function Region({ x, y, onInvite, children }: { x: number; y: number; onInvite?: (() => void) | undefined; children: React.ReactNode }) {
	return (
		<div className="absolute" style={{ left: x, top: y }}>
			<div className="mb-[16px] flex h-[22px] items-center gap-[10px]">
				<TeamMark size={18} />
				<span className="type-value">tidemark</span>
				<Faces ids={MEMBERS.map((person) => person.id)} size={20} ring="border-canvas" />
				<button type="button" className="rounded-[5px] border border-border-raised px-[8px] py-[1px] text-muted type-detail hover:text-text" onClick={onInvite}>
					invite
				</button>
			</div>
			<div className="relative" style={{ width: 2 * W + 40, height: 2 * H + 64 }}>
				{children}
			</div>
		</div>
	);
}

function Cover({ project, x, y, web, onOpen }: { project: TeamProject; x: number; y: number; web: boolean; onOpen?: (() => void) | undefined }) {
	const away = !web && !project.onMac;
	return (
		<button type="button" className="group/cover absolute text-left" style={{ left: x, top: y, width: W }} onClick={away ? undefined : onOpen}>
			<div className="mb-[7px] flex items-center justify-between type-value">
				<span className={cn(project.here.length > 0 ? "text-text" : "text-muted")}>{project.name}</span>
				<span className="text-muted type-detail">{away ? "not on this Mac" : project.edited}</span>
			</div>
			<div className={cn("relative overflow-hidden rounded-[3px] outline outline-1 outline-border", project.here.length > 0 && "outline-border-raised")} style={{ height: H }}>
				<ProjectArtwork kind={project.art} className={cn("h-full w-full object-cover object-top", away && "opacity-30 grayscale")} />
				{away && (
					<span className="absolute inset-0 grid place-items-center">
						<span className="rounded-[6px] border border-border-raised bg-bg px-[11px] py-[5px] type-control">Get it</span>
					</span>
				)}
				{web && (
					<span className="absolute right-[8px] bottom-[8px] flex gap-[6px] opacity-0 group-hover/cover:opacity-100">
						<span className="rounded-[6px] border border-border-raised bg-bg px-[9px] py-[4px] type-control">Look</span>
						<span className="rounded-[6px] bg-text px-[9px] py-[4px] text-bg type-control">Open in spool</span>
					</span>
				)}
			</div>
		</button>
	);
}

function Rail({ web }: { web: boolean }) {
	return (
		<aside className="flex h-full flex-col border-border border-r px-[16px] pt-[24px] pb-[22px]">
			<div className="mb-[26px] flex h-[28px] items-center gap-[9px] px-[8px] [font:var(--type-mark)] tracking-[-1px]">
				<SpoolMark className="h-[22px] w-[17px] text-thread" />
				<span>spool</span>
			</div>
			<p className="mb-[6px] px-[8px] text-muted type-detail">tidemark</p>
			{TEAM.map((project) => (
				<RailRow key={project.name} project={project} />
			))}
			{!web && (
				<>
					<p className="mt-[20px] mb-[6px] px-[8px] text-muted type-detail">your projects</p>
					{OWN.map((project) => (
						<RailRow key={project.name} project={project} />
					))}
				</>
			)}
			<p className="mt-auto px-[8px] text-muted type-detail">{web ? "ada@tidemark.app" : "On this Mac"}</p>
		</aside>
	);
}

function RailRow({ project }: { project: TeamProject }) {
	const inside = [...new Set(project.here.map((item) => item.who))];
	return (
		<div className="flex h-[30px] items-center gap-[8px] rounded-[6px] px-[8px] hover:bg-surface">
			<span className={cn("flex-1 truncate type-value", project.here.length > 0 ? "text-text" : "text-muted")}>{project.name}</span>
			{inside.length > 0 && <Faces ids={inside} size={16} ring="border-bg" />}
		</div>
	);
}
