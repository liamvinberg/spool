import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { BillingCycle, CloudTeam, PeopleBilling, TeamSetup } from "./api";
import { cn } from "./cn";
import { DOWNLOAD_URL } from "./desktop-bridge";
import { handoverAddress, knock } from "./handover";
import { CheckIcon, FrameIcon } from "./icons";
import { Button } from "./primitives/actions";
import { TextAction, Toast } from "./primitives/feedback";
import { TextField } from "./primitives/inputs";
import { Segment, SegmentedControl } from "./primitives/selection";
import { PayChoice, useBilling } from "./team-billing";
import { peopleSays, seatCost, TeamsSourceContext, teamSays } from "./teams";

/**
 * A new team's setup list, on its Projects page for admins: the same numbered list on spool.page and in the app, so
 * the app carries on at the step the web stopped at. Each step is read from what spool.page sees (invites sent, a
 * Mac signed in, a team project); only Skip and done are kept. A done step keeps its title and says what came of
 * it; once the last is done the list goes for good and the host says so once.
 */

/** A project of this Mac's own, which step 4 offers to move in. */
export interface OwnProject {
	root: string;
	name: string;
}

/** What the host Home gives the list: where it is drawn, who is signed in, and what it can do there. */
export interface SetupHost {
	/** The Mac app, which holds this Mac's own projects; or a browser at spool.page/<team>. */
	on: "mac" | "browser";
	/** The signed-in account's address. */
	you: string;
	/** Where the team's pages are: `<origin>/<address>`. */
	origin: string;
	/** In the app: this Mac's own projects, each of which can move in. */
	own?: readonly OwnProject[];
	/** In the app: today's Move to team… sheet, for this team. */
	onMove?: (project: OwnProject) => void;
	/** Opens Stripe's Checkout, or the download. */
	onOpen: (url: string) => void;
	/** The cycle the payment choice starts on, as the landing's switch showed it. */
	cycle?: BillingCycle | undefined;
	/** The last step is done and spool.page has the list gone for good. */
	onSetUp: (team: CloudTeam) => void;
	/** Read the facts again when this changes, as when a project moved in on this Mac. */
	revision?: string;
}

type StepId = "named" | "pay" | "invited" | "mac" | "moved";

interface Step {
	id: StepId;
	title: string;
	/** What came of it, once done. */
	result: string | null;
}

/** The steps in order, each done or not from its fact. */
export function setupSteps(team: CloudTeam, setup: TeamSetup, host: Pick<SetupHost, "on" | "you" | "origin">): Step[] {
	const { named, pay, invited, mac, moved } = setup.steps;
	const steps: Step[] = [
		{ id: "named", title: "Name the team", result: `${new URL(host.origin).host}/${named.address}` },
	];
	if (pay !== null) steps.push({ id: "pay", title: `Pay for ${team.name}`, result: pay.paid ? "Paid" : null });
	steps.push(
		{ id: "invited", title: "Invite people", result: invited === null ? null : invitedSays(invited) },
		{
			id: "mac",
			title: "Get spool on your Mac",
			result:
				mac === null
					? null
					: host.on === "mac" && mac.email === host.you
						? "Signed in on this Mac"
						: `Signed in as ${mac.email}`,
		},
		{ id: "moved", title: "Move a project in", result: moved?.project ?? null },
	);
	return steps;
}

function invitedSays(invited: NonNullable<TeamSetup["steps"]["invited"]>): string {
	if (invited === "skipped") return "Skipped";
	const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
	const said = [
		invited.editors > 0 ? count(invited.editors, "editor") : null,
		invited.viewers > 0 ? count(invited.viewers, "viewer") : null,
	].filter((part) => part !== null);
	return said.length === 0 ? "Invited" : `${said.join(" and ")} invited`;
}

export function TeamSetupList({
	team,
	host,
	onShowing,
}: {
	team: CloudTeam;
	host: SetupHost;
	/** Whether the list is on screen, so the page can leave out its empty state beneath it. */
	onShowing?: (showing: boolean) => void;
}) {
	const source = useContext(TeamsSourceContext);
	const [setup, setSetup] = useState<TeamSetup | null>(null);
	const finishing = useRef(false);
	const admin = team.role === "admin";
	const { onSetUp } = host;
	const load = useCallback(async () => {
		try {
			setSetup(await source.setup(team.address));
		} catch {
			// a spool.page that can't say, or predates the list: nothing to show
		}
	}, [source, team.address]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the revision is what asks again
	useEffect(() => {
		if (!admin) return;
		void load();
		const back = () => void load();
		window.addEventListener("focus", back);
		return () => window.removeEventListener("focus", back);
	}, [admin, load, host.revision]);
	const steps = setup === null ? [] : setupSteps(team, setup, host);
	const complete = setup !== null && steps.every((step) => step.result !== null);
	const showing = admin && setup !== null && !setup.done && !complete;
	useEffect(() => onShowing?.(showing), [onShowing, showing]);
	// the last step done: spool.page has it gone for good, and the host says so this once
	useEffect(() => {
		if (!admin || setup === null || setup.done || !complete || finishing.current) return;
		finishing.current = true;
		void source.setupDone(team.address).then(
			(read) => {
				setSetup(read);
				onSetUp(team);
			},
			() => {
				finishing.current = false;
			},
		);
	}, [admin, setup, complete, source, team, onSetUp]);
	if (!showing) return null;
	const at = steps.findIndex((step) => step.result === null);
	const number = (id: StepId) => steps.findIndex((step) => step.id === id) + 1;
	const body = (id: StepId): ReactNode => {
		switch (id) {
			case "pay":
				return <PayStep team={team} host={host} />;
			case "invited":
				return (
					<InviteStep
						team={team}
						onSkip={async () => setSetup(await source.skipInvites(team.address))}
						onSent={load}
					/>
				);
			case "mac":
				return <MacStep team={team} host={host} next={number("moved")} />;
			case "moved":
				return <MoveStep team={team} host={host} />;
			default:
				return null;
		}
	};
	return (
		<section className="pj-team-setup mb-[36px] max-w-[640px]" aria-label={`Set up ${team.name}`}>
			<h2 className="type-title">Set up {team.name}</h2>
			<p className="mt-[4px] text-secondary type-control">Once these are done, this list goes away.</p>
			<ol className="mt-[18px] flex flex-col border-line-default border-b">
				{steps.map((step, index) => {
					const done = step.result !== null;
					const current = index === at;
					return (
						<li
							key={step.id}
							data-step={step.id}
							data-state={done ? "done" : current ? "current" : "later"}
							aria-current={current ? "step" : undefined}
							className="flex gap-[14px] border-line-default border-t py-[14px]"
						>
							<span
								className={cn(
									"grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border type-detail",
									done
										? "border-transparent bg-surface-control text-primary"
										: current
											? "border-primary text-primary"
											: "border-line-strong text-secondary",
								)}
							>
								{done ? <CheckIcon className="h-[12px] w-[12px]" /> : index + 1}
							</span>
							<div className="flex min-w-0 flex-1 flex-col pt-[1px]">
								<span className={cn("type-control", !current && "text-secondary")}>{step.title}</span>
								{done && <span className="mt-[2px] text-secondary type-label">{step.result}</span>}
								{current && <div className="mt-[14px]">{body(step.id)}</div>}
							</div>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

/** An account whose trial is used pays first: Billing's own choice, in the list. */
function PayStep({ team, host }: { team: CloudTeam; host: SetupHost }) {
	const { summary, people, notice, pay } = useBilling(team, host.onOpen);
	return (
		<div className="flex flex-col gap-[16px]">
			<p className="text-secondary type-control">This account has had its trial, so {team.name} starts paid.</p>
			{notice && (
				<p role="status" className="type-control">
					{notice}
				</p>
			)}
			{summary && people && (
				<PayChoice
					compact
					people={people}
					prices={summary.prices}
					cycle={host.cycle}
					onPay={async (editors, cycle) => void (await pay(editors, cycle))}
				/>
			)}
		</div>
	);
}

type InviteRole = "editor" | "viewer";

/** Email rows, each an editor or a viewer, sent with the team's own invite; or skipped, to set up alone first. */
function InviteStep({
	team,
	onSkip,
	onSent,
}: {
	team: CloudTeam;
	onSkip: () => Promise<void>;
	onSent: () => Promise<void>;
}) {
	const source = useContext(TeamsSourceContext);
	const made = useRef(1);
	const [rows, setRows] = useState<{ key: number; email: string; role: InviteRole }[]>([
		{ key: 0, email: "", role: "editor" },
	]);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	// what one more seat costs, on a team that already pays, as People says it under its invite
	const [billing, setBilling] = useState<PeopleBilling | undefined>();
	useEffect(() => {
		let current = true;
		void source.people(team.address).then(
			(people) => current && setBilling(people.billing),
			// unread, the rows go without a cost line: the invite still goes, and spool.page still decides
			() => {},
		);
		return () => {
			current = false;
		};
	}, [source, team.address]);
	const filled = rows.filter((row) => row.email.trim() !== "");
	const change = (key: number, next: Partial<{ email: string; role: InviteRole }>) => {
		const changed = rows.map((row) => (row.key === key ? { ...row, ...next } : row));
		const last = changed[changed.length - 1];
		// one more empty row once the last has an address in it
		if (last !== undefined && last.email.trim() !== "")
			changed.push({ key: made.current++, email: "", role: "editor" });
		setRows(changed);
	};
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setNotice(null);
		try {
			await action();
		} catch (error) {
			setNotice(teamSays(error));
		} finally {
			setBusy(false);
		}
	};
	const send = () =>
		run(async () => {
			const left: typeof rows = [];
			let refused: unknown;
			for (const row of filled) {
				try {
					await source.invite(team.address, row.email.trim(), row.role);
				} catch (error) {
					refused ??= error;
					left.push(row);
				}
			}
			if (refused !== undefined) {
				setRows([...left, { key: made.current++, email: "", role: "editor" }]);
				setNotice(peopleSays(refused, billing));
			}
			await onSent();
		});
	return (
		<form
			className="flex flex-col gap-[8px]"
			onSubmit={(event) => {
				event.preventDefault();
				if (filled.length > 0) void send();
			}}
		>
			{rows.map((row, index) => {
				const label = index === 0 ? "Email address" : "Another email address";
				const cost = row.email.trim() === "" ? null : seatCost(billing, row.role, row.email);
				return (
					<div key={row.key} className="flex flex-col gap-[6px]">
						<div className="flex items-center gap-[8px]">
							<TextField
								size="lg"
								className="flex-1"
								value={row.email}
								onValueChange={(email) => change(row.key, { email })}
								placeholder={label}
								label={label}
								inputProps={{ type: "email" }}
							/>
							{row.email.trim() !== "" && (
								<SegmentedControl
									label={`Role of ${row.email.trim()}`}
									value={row.role}
									onValueChange={(role) => change(row.key, { role: role as InviteRole })}
								>
									<Segment value="editor">editor</Segment>
									<Segment value="viewer">viewer</Segment>
								</SegmentedControl>
							)}
						</div>
						{cost && <p className="pj-seat-cost text-secondary type-label">{cost}</p>}
					</div>
				);
			})}
			<p className="mt-[2px] text-secondary type-label">
				Editors work from their own Mac. Viewers watch in a browser and are free.
			</p>
			{notice && (
				<p role="status" className="type-control">
					{notice}
				</p>
			)}
			<div className="mt-[10px] flex items-center gap-[8px]">
				<Button type="submit" size="lg" variant="primary" disabled={busy || filled.length === 0}>
					Send invites
				</Button>
				<Button size="lg" variant="ghost" disabled={busy} onClick={() => void run(onSkip)}>
					Skip
				</Button>
			</div>
		</form>
	);
}

/** Open in spool hands the team alone to spool on this Mac, when it answers. */
function OpenInSpool({ team, onNotice }: { team: CloudTeam; onNotice: (message: string | null) => void }) {
	const [knocking, setKnocking] = useState(false);
	return (
		<Button
			size="lg"
			disabled={knocking}
			onClick={async () => {
				setKnocking(true);
				onNotice(null);
				const answered = await knock();
				setKnocking(false);
				if (answered) window.location.assign(handoverAddress({ team: team.address }));
				else onNotice("spool isn’t open on this Mac");
			}}
		>
			Open in spool
		</Button>
	);
}

/** From the web, the Mac: download spool or open it, and sign in there to carry on. */
function MacStep({ team, host, next }: { team: CloudTeam; host: SetupHost; next: number }) {
	const [notice, setNotice] = useState<string | null>(null);
	if (host.on === "mac")
		return (
			<p className="text-secondary type-label">
				spool on this Mac is signed in as {host.you}. This step is done as soon as spool.page sees it.
			</p>
		);
	return (
		<div className="flex flex-col gap-[12px]">
			<div className="flex items-center gap-[8px]">
				<Button size="lg" variant="primary" onClick={() => host.onOpen(DOWNLOAD_URL)}>
					Download for Mac
				</Button>
				<OpenInSpool team={team} onNotice={setNotice} />
			</div>
			<p className="text-secondary type-label">
				Sign in there as {host.you} and spool carries on with step {next}.
			</p>
			{notice && (
				<p role="status" className="type-control">
					{notice}
				</p>
			)}
		</div>
	);
}

/** In the app, this Mac's own projects, each moving in through today's sheet; in a browser, a pointer to the app. */
function MoveStep({ team, host }: { team: CloudTeam; host: SetupHost }) {
	const [notice, setNotice] = useState<string | null>(null);
	if (host.on === "browser")
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="text-secondary type-label">
					Carry on in spool on your Mac: this step lists your own projects there, each with Move to {team.name}…
				</p>
				<div className="flex items-center gap-[8px]">
					<OpenInSpool team={team} onNotice={setNotice} />
				</div>
				{notice && (
					<p role="status" className="type-control">
						{notice}
					</p>
				)}
			</div>
		);
	const own = host.own ?? [];
	if (own.length === 0)
		return (
			<p className="text-secondary type-label">
				No projects of your own on this Mac yet. New project… starts one in {team.name}.
			</p>
		);
	return (
		<ul className="flex flex-col border-line-default border-b">
			{own.map((project) => (
				<li key={project.root} className="flex h-[54px] items-center gap-[14px] border-line-default border-t">
					<FrameIcon className="h-[16px] w-[16px] shrink-0 text-secondary" />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate type-control">{project.name}</span>
						<span className="truncate text-secondary type-detail">{project.root}</span>
					</span>
					<Button onClick={() => host.onMove?.(project)}>Move to {team.name}…</Button>
				</li>
			))}
		</ul>
	);
}

/** How long "<team> is set up" stays. */
export const SET_UP_TOAST_MS = 6_000;

/**
 * Home's toast, said once when a team's last setup step is done: `onSetUp` is the list's, `toast` what the host
 * draws, and Invite more takes the host to that team's People.
 */
export function useSetUpToast(onInviteMore: (team: CloudTeam) => void): {
	toast: ReactNode;
	onSetUp: (team: CloudTeam) => void;
} {
	const [setUp, setSetUp] = useState<CloudTeam | null>(null);
	const dismiss = useCallback(() => setSetUp(null), []);
	const toast = setUp && (
		<SetUpToast
			team={setUp}
			onDismiss={dismiss}
			onInviteMore={() => {
				setSetUp(null);
				onInviteMore(setUp);
			}}
		/>
	);
	return { toast, onSetUp: setSetUp };
}

function SetUpToast({
	team,
	onInviteMore,
	onDismiss,
}: {
	team: CloudTeam;
	onInviteMore: () => void;
	onDismiss: () => void;
}) {
	useEffect(() => {
		const timer = setTimeout(onDismiss, SET_UP_TOAST_MS);
		return () => clearTimeout(timer);
	}, [onDismiss]);
	return (
		<div className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20">
			<Toast
				message={`${team.name} is set up`}
				action={<TextAction onClick={onInviteMore}>Invite more</TextAction>}
				drain={SET_UP_TOAST_MS}
				onDismiss={onDismiss}
			/>
		</div>
	);
}
