import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { ChevronIcon, FolderIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { Face, type Mate } from "shared/ui/spool/presence";
import { TeamMark } from "shared/ui/spool/teams";
import { UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * spool on a phone (DEV-194), the shipped read-only canvas held at one moment, mirroring `src/ui/viewer/`:
 * `navigator.tsx`, `phone-play.tsx` and `shared-link.tsx`. An iPhone upright, 393 × 852, its notch and home bar
 * the safe areas everything pads by (62 and 34).
 *
 * `navigator` is a team canvas link on a member's phone: recent, the top level's pages with their frame counts
 * and its own frames as covers, and a teammate's save arriving as a toast. Who is in each part shows beside it
 * (DEV-197): everyone at the top, ana under checkout and inside `cart`, ben and mira under onboarding. `play` is a desktop frame played
 * upright, whole and small, asking for the phone to be turned. `link` is a shared link opened in the phone's
 * browser the first time: the prototype full screen, and the card under it saying how to keep it.
 */

export type PhoneSpecimen = "navigator" | "play" | "link";

const TOP = 62;
const BOTTOM = 34;
const TEAM = { address: "devosurf", name: "Devosurf", logo: null };

const RECENT = [
	{ frame: "cart", screen: "cart", by: "jonas", ago: "2 min ago", page: "checkout", changed: true },
	{ frame: "menu", screen: "menu", by: "mira", ago: "2 hours ago", page: "", changed: false },
	{ frame: "receipt", screen: "receipt", by: "ana", ago: "yesterday", page: "checkout", changed: false },
] as const;

const ANA: Mate = { name: "ana", color: "#7aa7ff" };
const BEN: Mate = { name: "ben", color: "#eaa94a" };
const MIRA: Mate = { name: "mira", color: "#4cc495", idle: true };

const PAGES: readonly { name: string; count: number; here?: readonly Mate[] }[] = [
	{ name: "checkout", count: 6, here: [ANA] },
	{ name: "menu", count: 4 },
	{ name: "onboarding", count: 9, here: [BEN, MIRA] },
	{ name: "explore", count: 112 },
];

const COVERS: readonly { name: string; screen: CoffeeScreenName | null; here?: readonly Mate[] }[] = [
	{ name: "menu", screen: "menu" },
	{ name: "cart", screen: "cart", here: [ANA] },
	{ name: "receipt", screen: "receipt" },
	{ name: "landing", screen: null },
];

export function SpoolPhoneScreen({ variant }: { variant: PhoneSpecimen }) {
	if (variant === "link") return <SharedLinkScreen />;
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg text-text">
			<Navigator />
			{variant === "play" && <DesktopPlayed />}
		</div>
	);
}

function Navigator() {
	return (
		<div className="flex h-full flex-col" style={{ paddingTop: TOP }}>
			<header className="flex h-12 shrink-0 items-center gap-2.5 px-4">
				<TeamMark team={TEAM} size={22} />
				<span className="min-w-0 truncate type-control">kaffe</span>
				<span className="ml-auto flex shrink-0 items-center gap-2.5">
					<PartFaces mates={[ANA, BEN, MIRA]} />
					<span className="text-muted type-detail">view only</span>
				</span>
			</header>
			<label className="mx-3 mb-1 flex h-10 shrink-0 items-center gap-2 rounded-md bg-surface px-3">
				<SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
				<span className="text-muted type-value" style={{ fontSize: 16 }}>
					find in kaffe
				</span>
			</label>
			<div className="min-h-0 flex-1 overflow-hidden">
				<Section>recent</Section>
				{RECENT.map((each) => (
					<Row key={each.frame} icon={<Thumb screen={each.screen} />}>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="flex min-w-0 items-center gap-1.5 type-value">
								<span className="truncate">{each.frame}</span>
								{each.changed && <UnseenMark mark="changed" />}
							</span>
							<span className="truncate text-muted type-detail">
								{each.by} · {each.ago}
								{each.page !== "" && ` · ${each.page}`}
							</span>
						</span>
					</Row>
				))}
				<div className="px-4 pt-4 pb-1 text-text type-detail">kaffe</div>
				{PAGES.map((page) => (
					<Row key={page.name} icon={<FolderIcon className="h-4 w-4 text-muted" />}>
						<span className="min-w-0 flex-1 truncate type-value">{page.name}</span>
						{page.here && <PartFaces mates={page.here} />}
						<span className="text-muted type-detail">{page.count}</span>
						<span className="flex h-2.5 w-2.5 shrink-0 text-muted">
							<ChevronIcon />
						</span>
					</Row>
				))}
				<div className="grid grid-cols-6 items-start gap-x-3 gap-y-4 px-4 pt-3">
					{COVERS.map((cover) => (
						<span key={cover.name} className="col-span-2 flex min-w-0 flex-col gap-1.5">
							<span
								className="relative block w-full overflow-hidden rounded-sm border border-border bg-surface"
								style={{ aspectRatio: "390 / 780" }}
							>
								{cover.screen === null ? (
									<span className="absolute inset-0 grid place-items-center text-muted type-detail">
										390 × 844
									</span>
								) : (
									<span className="absolute top-0 left-0 h-[844px] w-[390px] origin-top-left scale-[0.27]">
										<CoffeeScreen screen={cover.screen} scale="full" />
									</span>
								)}
								{cover.here && (
									<span className="absolute right-1 bottom-1">
										<PartFaces mates={cover.here} />
									</span>
								)}
							</span>
							<span className="truncate type-value">{cover.name}</span>
						</span>
					))}
				</div>
			</div>
			<div className="absolute inset-x-0 z-20 flex justify-center px-3" style={{ bottom: 14 + BOTTOM }}>
				<span className="flex h-10 max-w-full items-center gap-2 rounded-md border border-border-raised bg-raised pr-1.5 pl-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] type-detail">
					<span className="min-w-0 truncate">jonas saved cart</span>
					<span className="shrink-0 rounded-xs bg-thread/15 px-1.5 py-0.5 text-thread">show</span>
				</span>
			</div>
		</div>
	);
}

/** A desktop frame played upright: whole, scaled to the phone's width between the notch and the home bar. */
function DesktopPlayed() {
	const scale = 393 / 1440;
	const top = TOP + (852 - TOP - BOTTOM - 900 * scale) / 2;
	return (
		<div className="absolute inset-0 z-30 bg-[#000]">
			<div
				className="absolute left-0 origin-top-left overflow-hidden bg-[#fff]"
				style={{ top, width: 1440, height: 900, transform: `scale(${scale})` }}
			>
				<div className="flex h-full">
					<div className="w-[360px] shrink-0 bg-[#f3efe8] p-16 font-sans text-[#2a211b]">
						<div className="text-[40px] leading-none">kaffe</div>
						<div className="mt-16 flex flex-col gap-6 text-[28px] text-[#2a211b]/60">
							<span className="text-[#2a211b]">Orders</span>
							<span>Menu</span>
							<span>Tables</span>
						</div>
					</div>
					<div className="flex flex-1 gap-10 p-16">
						{(["menu", "cart", "receipt"] as const).map((screen) => (
							<div key={screen} className="relative h-[700px] w-[300px] overflow-hidden rounded-[18px] border border-[#2a211b]/10">
								<CoffeeScreen screen={screen} scale="full" />
							</div>
						))}
					</div>
				</div>
			</div>
			<span
				className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#fff]/10 bg-[#000]/80 px-2.5 py-1.5 text-[#fff]/80 type-detail"
				style={{ top: top + 900 * scale + 16 }}
			>
				1440 × 900 · turn the phone
			</span>
			<span className="absolute top-1/2 right-2 flex items-center gap-1.5 rounded-sm border border-[#fff]/10 bg-[#000]/80 py-1.5 pr-2.5 pl-2 text-[#fff] type-detail">
				‹ pull to go back
			</span>
		</div>
	);
}

/** A link share in the phone's browser the first time: the prototype runs full screen, the card sits under it. */
function SharedLinkScreen() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-[#fff]">
			<div className="absolute inset-0">
				<CoffeeScreen screen="menu" scale="full" />
			</div>
			<div
				className="absolute inset-x-2.5 z-40 rounded-lg border border-border-raised bg-raised p-5 text-text shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
				style={{ bottom: 10 + BOTTOM }}
			>
				<div className="flex items-center gap-3">
					<span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border-raised bg-bg text-thread">
						<SpoolMark className="h-[22px] w-[17px]" />
					</span>
					<div className="min-w-0">
						<div className="truncate type-heading">kaffe</div>
						<div className="text-muted type-detail">ana shared this · updated 2 min ago</div>
					</div>
				</div>
				<p className="mt-4 mb-5 text-muted type-control">
					To open it like an app, tap <b className="text-text tracking-widest">···</b> in Safari’s bar, then{" "}
					<b className="text-text">Share</b>, then <b className="text-text">Add to Home Screen</b>.
				</p>
				<span className="grid h-11 w-full place-items-center rounded-md bg-text text-bg type-control">
					Open it here
				</span>
			</div>
		</div>
	);
}

/** Whoever is in one part, as `viewer-presence.tsx` draws them: 18px faces, overlapping. */
function PartFaces({ mates }: { mates: readonly Mate[] }) {
	return (
		<span className="flex shrink-0 items-center">
			{mates.map((mate, i) => (
				<span key={mate.name} className="relative h-[18px] shrink-0" style={{ width: i === mates.length - 1 ? 18 : 13, zIndex: mates.length - i }}>
					<Face mate={mate} followed={false} size={18} />
				</span>
			))}
		</span>
	);
}

function Section({ children }: { children: ReactNode }) {
	return <div className="px-4 pt-3 pb-1 text-muted type-detail">{children}</div>;
}

function Row({ children, icon }: { children: ReactNode; icon: ReactNode }) {
	return (
		<div className={cn("flex min-h-12 w-full min-w-0 items-center gap-3 py-1.5 pr-4 pl-4")}>
			<span className="flex w-9 shrink-0 justify-center">{icon}</span>
			{children}
		</div>
	);
}

function Thumb({ screen }: { screen: CoffeeScreenName }) {
	return (
		<span className="relative block h-9 w-5 overflow-hidden rounded-[3px] bg-surface">
			<span className="absolute top-0 left-0 h-[844px] w-[390px] origin-top-left scale-[0.052]">
				<CoffeeScreen screen={screen} scale="full" />
			</span>
		</span>
	);
}
