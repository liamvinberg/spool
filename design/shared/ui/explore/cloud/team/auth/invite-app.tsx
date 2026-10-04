import { INVITED_TO, OTHER_TEAMS } from "shared/lib/explore/cloud/team/fixture";
import { cn } from "shared/lib/utils";
import { CheckIcon } from "shared/ui/spool/icons";
import { AppHome, AppToast, BUTTON, LetterMark, type Links, MenuPlus, MenuRow, MenuRule, OwnMark, PRIMARY, Switch, SwitchMenu, TidemarkMark } from "./parts";

/**
 * How an invite shows up in spool for somebody who already has an account:
 * Ada, at home in Tidemark, invited to Harbour Bank as a viewer by Kim.
 *
 *   menu  a row in the team switcher's menu, with Join and Decline, and a dot
 *         on the switcher. Bets the invite belongs with the teams it would join.
 *   home  one quiet line on Home above the covers. Bets an invite is news, and
 *         news is read where you already look.
 *
 * Harbour Bank is a viewer's team, so its projects open in the browser; where
 * the app puts a team you only watch is drawn here as a question, not settled.
 */

export type InviteAppTake = "menu" | "home";
export type InviteAppState = "base" | "joined";

const HARBOUR = <LetterMark letter="H" hue={INVITED_TO.hue} />;
const NORTH = <LetterMark letter="N" hue={OTHER_TEAMS[0]!.hue} />;
const KIM = INVITED_TO.by;

const SAYS: Record<InviteAppTake, Record<InviteAppState, string>> = {
	menu: {
		base: "Switcher row. The invite sits in the menu of teams it would join, and a dot on the switcher says something is in there.",
		joined: "Switcher row. Joined, Harbour Bank is one more team in the list, marked as one you watch in the browser.",
	},
	home: {
		base: "Home line. One quiet line above the covers, on whichever team's Home you are looking at.",
		joined: "Home line. The line says where Harbour Bank went and goes away once you have been there.",
	},
};

export function InviteApp({ take, state = "base", links = {} }: { take: InviteAppTake; state?: InviteAppState; links?: Links<InviteAppState> }) {
	const caption = SAYS[take][state];
	if (take === "menu") {
		return (
			<AppHome
				team
				people
				tabs={["tidemark app", "kaffe"]}
				switcher={<Switch mark={<TidemarkMark />} label="Tidemark" dot={state === "base"} open />}
				foot="On this Mac"
				caption={caption}
				overlay={
					<>
						<SwitchMenu width={330}>
							<MenuRow mark={<TidemarkMark />} label="Tidemark" detail={<Checked detail="5 people" />} checked />
							<MenuRow mark={NORTH} label="Northlight" detail="2 people" />
							{state === "joined" && <MenuRow mark={HARBOUR} label="Harbour Bank" detail="viewer ↗" />}
							<MenuRule />
							<MenuRow mark={<OwnMark />} label="Your projects" detail="2 on this Mac" />
							<MenuRule />
							{state === "base" && (
								<>
									<div className="flex flex-col gap-[10px] rounded-[6px] px-[9px] py-[9px]">
										<div className="flex items-center gap-[10px]">
											<span className="grid w-[20px] place-items-center">{HARBOUR}</span>
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="type-control">Harbour Bank</span>
												<span className="truncate text-muted type-label">{KIM} invited you to watch</span>
											</span>
										</div>
										<div className="flex gap-[6px] pl-[30px]">
											<button type="button" className={cn(PRIMARY, "min-h-[28px] px-[11px]")} onClick={links.joined}>
												Join
											</button>
											<button type="button" className={cn(BUTTON, "min-h-[28px] px-[11px]")}>
												Decline
											</button>
										</div>
									</div>
									<MenuRule />
								</>
							)}
							<MenuRow mark={<MenuPlus />} label="New team…" />
						</SwitchMenu>
						{state === "joined" && <AppToast>You joined Harbour Bank as a viewer</AppToast>}
					</>
				}
			/>
		);
	}
	return (
		<AppHome
			team
			people
			tabs={["tidemark app", "kaffe"]}
			switcher={<Switch mark={<TidemarkMark />} label="Tidemark" />}
			foot="On this Mac"
			caption={caption}
			notice={
				<div className="-mt-[8px] mb-[22px] flex h-[48px] items-center gap-[12px] border-border border-y">
					{HARBOUR}
					{state === "base" ? (
						<>
							<span className="flex-1 type-control">
								{KIM} invited you to Harbour Bank. <span className="text-muted">You'd watch their projects live in the browser.</span>
							</span>
							<button type="button" className="px-[10px] text-muted type-control hover:text-text">
								Decline
							</button>
							<button type="button" className={cn(BUTTON, "min-h-[30px]")} onClick={links.joined}>
								Join Harbour Bank
							</button>
						</>
					) : (
						<>
							<span className="flex-1 type-control">
								You're in Harbour Bank. <span className="text-muted">It's in the switcher, top left, with Tidemark and Northlight.</span>
							</span>
							<button type="button" className={cn(BUTTON, "min-h-[30px]")}>
								Go to Harbour Bank ↗
							</button>
						</>
					)}
				</div>
			}
		/>
	);
}

function Checked({ detail }: { detail: string }) {
	return (
		<span className="flex items-center gap-[8px]">
			{detail}
			<CheckIcon className="h-[12px] w-[12px] text-text" />
		</span>
	);
}
