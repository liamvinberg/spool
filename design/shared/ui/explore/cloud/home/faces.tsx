import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { FrameIcon, PlusIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { Count, Cursor, Faces, Grid, Host, InviteField, Layout, NavItem, OWN, PeopleList, Search, TEAM, people } from "./parts";
import type { TeamState, TeamWalks } from "./team-home";

/**
 * faces: there is no team page.
 *
 * Home stays the Home that ships. A team project sits in the grid with your own,
 * and the only sign it is shared is the people inside it. Who is in a project is
 * asked where the project is, so People is a button on the open canvas, beside
 * the tabs, the way a document's share button sits on the document. A link to a
 * team project opens spool itself: spool.page knocks on the daemon the way
 * local.spool.page already does, and the browser look is the fallback.
 */
export function FacesTake({ state, onOpen }: { state: TeamState } & TeamWalks) {
	if (state === "web") return <Knock />;
	if (state === "invite") return <ProjectPeople />;
	const all = [TEAM[0]!, OWN[0]!, TEAM[1]!, TEAM[2]!, OWN[1]!, TEAM[3]!];
	return (
		<Host host="app">
			<Layout nav={<NavItem icon={<FrameIcon />} label="Projects" current />} foot="On this Mac">
				<header className="mb-[31px] flex items-center justify-between gap-[25px]">
					<h1 className="type-page">Projects</h1>
					<div className="flex items-center gap-[13px]">
						<Search placeholder="Search projects" />
						<button type="button" className={HOME_ACTION}>
							Open…
						</button>
						<button type="button" className={HOME_ACTION_PRIMARY}>
							<PlusIcon className="h-[10px] w-[10px]" />
							New project…
						</button>
					</div>
				</header>
				<Count n={all.length} />
				<Grid projects={all} onOpen={onOpen} />
			</Layout>
		</Host>
	);
}

function ProjectPeople() {
	const project = TEAM[0]!;
	return (
		<Host
			host="app"
			active="tidemark app"
			accessory={
				<button type="button" className="flex h-[30px] items-center gap-[8px] rounded-[7px] bg-surface pr-[11px] pl-[4px] type-control">
					<Faces ids={["ada", ...people(project)]} size={22} ring="border-surface" />
					People
				</button>
			}
		>
			<TeamCanvas />
			<div className="absolute top-[8px] right-[16px] z-40 w-[380px] rounded-[10px] border border-border-raised bg-surface p-[20px]">
				<p className="type-title font-[500]">tidemark app</p>
				<p className="mt-[4px] mb-[18px] text-muted type-control">Everyone in Tidemark can open and change it.</p>
				<InviteField />
				<div className="mt-[16px] border-border-raised border-t pt-[6px]">
					<PeopleList where />
				</div>
				<div className="mt-[10px] flex items-center justify-between border-border-raised border-t pt-[14px] text-muted type-control">
					<span>Copy link</span>
					<span className="type-detail">spool.page/tidemark/tidemark-app</span>
				</div>
			</div>
		</Host>
	);
}

/** The team project open on the canvas, Jonas and Mira's pointers where they are. */
export function TeamCanvas() {
	return (
		<CanvasChrome
			pages={[
				{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
				{ name: "site", frames: ["landing", "pricing"] },
			]}
			selected="cart"
		>
			<Frame left={40} top={120} screen="menu" />
			<Frame left={340} top={150} screen="cart" />
			<Frame left={640} top={100} screen="receipt" />
			<Cursor id="mira" x={170} y={330} />
			<Cursor id="jonas" x={430} y={420} />
			<span className="absolute top-[72px] left-[640px] flex items-center gap-[6px] rounded-[4px] border border-border-raised bg-bg px-[6px] py-[2px] type-detail">
				<span className="h-[6px] w-[6px] animate-pulse rounded-full" style={{ background: "#7FA7D4" }} />
				jonas's agent writing
			</span>
		</CanvasChrome>
	);
}

function Frame({ left, top, screen }: { left: number; top: number; screen: CoffeeScreenName }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="text-muted type-value">{screen}</span>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} />
			</div>
		</div>
	);
}

/** spool.page/tidemark/tidemark-app: the link knocks on spool and hands over. */
function Knock() {
	return (
		<Host host="web" url="spool.page/tidemark/tidemark-app">
			<div className="flex h-full flex-col items-center justify-center pb-[60px]">
				<span className="relative grid h-[72px] w-[72px] place-items-center">
					<span className="absolute inset-0 animate-ping rounded-full border border-thread opacity-30 [animation-duration:2.4s]" />
					<SpoolMark className="h-[36px] w-[27px] text-thread" />
				</span>
				<h1 className="mt-[34px] type-heading">Opening tidemark app in spool</h1>
				<p className="mt-[10px] text-muted type-control">Jonas and Mira are in it now.</p>
				<div className="mt-[44px] flex items-center gap-[18px] text-muted type-control">
					<button type="button" className="hover:text-text">
						Look in the browser instead
					</button>
					<span className="h-[14px] w-px bg-border-raised" />
					<button type="button" className="hover:text-text">
						Get spool
					</button>
				</div>
				<p className="absolute bottom-[28px] text-muted type-detail">ada@tidemark.app · tidemark</p>
			</div>
		</Host>
	);
}
