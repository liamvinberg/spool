import { type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { BillingCycle, BillingSummary, CloudTeam, TeamPeople } from "./api";
import { cn } from "./cn";
import { Button } from "./primitives/actions";
import { Checkbox, Segment, SegmentedControl } from "./primitives/selection";
import { TeamsSourceContext, teamSays } from "./teams";

/**
 * Settings › Billing: what a team pays and when, for its admins only. spool.page decides every rule and Stripe holds
 * the card; this page says where the team stands and hands an admin to Stripe's Checkout or portal.
 */

/** How often Billing reads again while it waits for Stripe to say a Checkout went through. */
export const CHECKOUT_POLL_MS = 2_000;
/** How long it waits each time, from opening Billing or coming back to it. */
const CHECKOUT_WAIT_MS = 60_000;
/** After this a Checkout is taken as abandoned, and Billing stops waiting for it. */
const CHECKOUT_FORGET_MS = 60 * 60_000;

const checkoutKey = (address: string) => `spool:checkout:${address}`;

/** Whether this window sent the team to Checkout lately, and so should wait for Stripe to say it paid. */
function checkoutPending(address: string): boolean {
	try {
		const at = Number(sessionStorage.getItem(checkoutKey(address)));
		return at > 0 && Date.now() - at < CHECKOUT_FORGET_MS;
	} catch {
		return false;
	}
}

/** This window sent the team to Checkout: Billing waits for Stripe to say it paid when it is opened. */
export function checkoutStarted(address: string): void {
	markCheckout(address, true);
}

/** Marks the team as gone to Checkout from this window, or no longer, so Billing waits for Stripe on its return. */
export function markCheckout(address: string, pending: boolean) {
	try {
		if (pending) sessionStorage.setItem(checkoutKey(address), String(Date.now()));
		else sessionStorage.removeItem(checkoutKey(address));
	} catch {
		// no storage: Billing still reads again on focus
	}
}

/** States with no paid time yet, where a Checkout's return is waited for. */
const UNPAID = new Set<BillingSummary["state"]>(["trial", "lapsed"]);

export function TeamBilling({
	team,
	onOpen,
	cycle,
	pollMs = CHECKOUT_POLL_MS,
}: {
	team: CloudTeam;
	/** Opens Stripe's page: this tab in a browser, the system browser from the Mac app. */
	onOpen: (url: string) => void;
	/** The cycle the payment choice starts on; yearly when not said. */
	cycle?: BillingCycle | undefined;
	pollMs?: number;
}) {
	const source = useContext(TeamsSourceContext);
	const [summary, setSummary] = useState<BillingSummary | null>(null);
	const [people, setPeople] = useState<TeamPeople | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const load = useCallback(async () => {
		try {
			const [read, members] = await Promise.all([source.billing(team.address), source.people(team.address)]);
			setSummary(read);
			setPeople(members);
			if (!UNPAID.has(read.state)) markCheckout(team.address, false);
			return read;
		} catch (error) {
			setNotice(teamSays(error));
			return null;
		}
	}, [source, team.address]);
	useEffect(() => {
		// billing is an admin's business: nobody else's screen asks for it
		if (team.role !== "admin") return;
		let current = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		// Back from Stripe: read again, and while a Checkout this window opened hasn't shown up, keep reading a while.
		const wait = (until: number) => {
			clearTimeout(timer);
			void load().then((read) => {
				if (!current || read === null || !UNPAID.has(read.state)) return;
				if (checkoutPending(team.address) && Date.now() + pollMs < until)
					timer = setTimeout(() => wait(until), pollMs);
			});
		};
		const back = () => wait(Date.now() + CHECKOUT_WAIT_MS);
		back();
		window.addEventListener("focus", back);
		return () => {
			current = false;
			clearTimeout(timer);
			window.removeEventListener("focus", back);
		};
	}, [load, pollMs, team.address, team.role]);
	if (team.role !== "admin") return null;
	const say = notice && (
		<p role="status" className="mb-[14px] type-control">
			{notice}
		</p>
	);
	if (summary === null || people === null) return say || null;
	const pay = async (editors: string[], cycle: BillingCycle) => {
		setNotice(null);
		try {
			const { url } = await source.checkout(team.address, editors, cycle);
			markCheckout(team.address, true);
			onOpen(url);
		} catch (error) {
			setNotice(teamSays(error));
		}
	};
	const manage = async () => {
		setNotice(null);
		try {
			onOpen((await source.portal(team.address)).url);
		} catch (error) {
			setNotice(teamSays(error));
		}
	};
	const line = stateLine(team, summary);
	return (
		<div className="pj-team-billing flex flex-col">
			{say}
			{line && <p className="mb-[22px] text-secondary type-control">{line}</p>}
			{summary.state === "free" ? null : summary.state === "trial" || summary.state === "lapsed" ? (
				<PayChoice people={people} prices={summary.prices} cycle={cycle} onPay={pay} />
			) : (
				<PaidSummary summary={summary} onManage={manage} />
			)}
		</div>
	);
}

/** The one line Billing opens with, above the summary or the payment choice. */
function stateLine(team: CloudTeam, summary: BillingSummary): ReactNode {
	switch (summary.state) {
		case "free":
			return "Free team";
		case "trial":
			return summary.trialEndsAt === null ? null : `On trial until ${day(summary.trialEndsAt)}.`;
		case "failing":
			return summary.lapsesAt === null
				? "The last payment failed. Update the card in Manage billing."
				: `The last payment failed. Stripe tries the card again until ${day(summary.lapsesAt)}, then ${team.name} goes local. Update the card in Manage billing.`;
		case "ending": {
			const ends = summary.cancelAt ?? summary.periodEnd;
			return `${ends === null ? "Ends when the paid period does." : `Ends on ${day(ends)}.`} Undo it in Manage billing to keep ${team.name}.`;
		}
		case "lapsed":
			if (!summary.hadTime) return `Pay for ${team.name}`;
			return `${summary.paidBefore === true ? `${team.name} has gone local` : `${team.name}’s trial has ended`}. Choose who stays an editor and pay to keep syncing. Anyone left out becomes a viewer.`;
		default:
			return null;
	}
}

/**
 * Who to pay for, monthly or yearly, and the total. Admins are always seats; an editor left out becomes a viewer
 * once Stripe takes the payment; viewers are free.
 */
export function PayChoice({
	people,
	prices,
	cycle: start = "yearly",
	compact = false,
	onPay,
}: {
	people: TeamPeople;
	prices: BillingSummary["prices"];
	/** The cycle it starts on: the landing's, when spool.page/start was given one. */
	cycle?: BillingCycle | undefined;
	/** Tighter, inside a list or a dialog. */
	compact?: boolean;
	onPay: (editors: string[], cycle: BillingCycle) => Promise<void>;
}) {
	const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
	const [cycle, setCycle] = useState<BillingCycle>(start);
	const [busy, setBusy] = useState(false);
	const admins = people.members.filter((person) => person.role === "admin");
	const editors = people.members.filter((person) => person.role === "editor");
	const viewers = people.members.filter((person) => person.role === "viewer");
	const kept = editors.filter((person) => !left.has(person.accountId));
	const seats = admins.length + kept.length;
	const monthly = cycle === "monthly" ? prices.monthly : prices.yearly / 12;
	const who = (person: TeamPeople["members"][number]) => (
		<span>
			{person.email}
			{person.you && <span className="text-secondary"> (you)</span>}
		</span>
	);
	return (
		<div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
			<div className="flex flex-col gap-2">
				<span className="type-label">Who you pay for</span>
				<ul className="flex flex-col border-line-default border-b">
					{[...admins, ...editors].map((person) => {
						const admin = person.role === "admin";
						const ticked = admin || !left.has(person.accountId);
						return (
							<li
								key={person.accountId}
								className="flex h-[44px] items-center gap-3 border-line-default border-t"
							>
								<Checkbox
									checked={ticked}
									disabled={admin}
									label={who(person)}
									onCheckedChange={(on) => {
										const next = new Set(left);
										if (on) next.delete(person.accountId);
										else next.add(person.accountId);
										setLeft(next);
									}}
								/>
								<span className="ml-auto text-secondary type-detail">
									{admin ? "admin" : ticked ? "editor" : "becomes a viewer"}
								</span>
							</li>
						);
					})}
					{viewers.map((person) => (
						<li
							key={person.accountId}
							className="flex h-[44px] items-center gap-3 border-line-default border-t pl-[26px] text-secondary type-control"
						>
							{who(person)}
							<span className="ml-auto type-detail">viewer · free</span>
						</li>
					))}
				</ul>
			</div>
			<div className="flex items-center justify-between">
				<SegmentedControl label="Billing" value={cycle} onValueChange={(value) => setCycle(value as BillingCycle)}>
					<Segment value="monthly">monthly · {money(prices.monthly)}</Segment>
					<Segment value="yearly">yearly · {money(prices.yearly / 12)}</Segment>
				</SegmentedControl>
				<span className="flex flex-col items-end">
					<span className="type-title" data-billing-total>
						{per(seats * (cycle === "monthly" ? prices.monthly : prices.yearly), cycle)}
					</span>
					<span className="text-secondary type-detail">
						{seats} {seats === 1 ? "editor" : "editors"} × {money(monthly)} a month
					</span>
				</span>
			</div>
			<div className="flex items-center justify-between gap-4">
				<p className="max-w-[360px] text-secondary type-label">
					Stripe takes the card. Add a company name and VAT number there if you have them.
				</p>
				<Button
					size="lg"
					variant="primary"
					disabled={busy}
					onClick={() => {
						setBusy(true);
						void onPay(
							kept.map((person) => person.accountId),
							cycle,
						).finally(() => setBusy(false));
					}}
				>
					Continue to payment
				</Button>
			</div>
		</div>
	);
}

/** A paying team: its plan, the next charge and the card, and Stripe's portal for everything else. */
function PaidSummary({ summary, onManage }: { summary: BillingSummary; onManage: () => Promise<void> }) {
	const [busy, setBusy] = useState(false);
	const rows: [string, string, string | null][] = [];
	if (summary.plan)
		rows.push([
			"Plan",
			`${summary.plan.seats} ${summary.plan.seats === 1 ? "seat" : "seats"}, billed ${summary.plan.cycle}`,
			per(summary.plan.amount, summary.plan.cycle),
		]);
	if (summary.nextCharge)
		rows.push([
			"Next charge",
			`${day(summary.nextCharge.at, true)} · ${money(summary.nextCharge.amount)}`,
			"Seats added before then are charged for the days left",
		]);
	if (summary.card)
		rows.push([
			"Card",
			`${brand(summary.card.brand)} ending ${summary.card.last4}`,
			summary.billingEmail && `Invoices go to ${summary.billingEmail}`,
		]);
	return (
		<div className="flex flex-col">
			{rows.map(([label, value, says], index) => (
				<div
					key={label}
					className={cn("flex items-start justify-between py-[16px]", index > 0 && "border-line-default border-t")}
				>
					<span className="type-control">{label}</span>
					<span className="flex flex-col items-end gap-[2px]">
						<span className="type-control">{value}</span>
						{says && <span className="text-secondary type-label">{says}</span>}
					</span>
				</div>
			))}
			<div className="flex items-center justify-between gap-4 border-line-default border-t pt-[18px]">
				<span className="text-secondary type-label">
					Seats follow roles: make someone an editor on People and the plan follows.
				</span>
				<Button
					disabled={busy}
					onClick={() => {
						setBusy(true);
						void onManage().finally(() => setBusy(false));
					}}
				>
					Manage billing
				</Button>
			</div>
		</div>
	);
}

/** Cents in dollars, whole where they are whole: $16, $1,920, $16.50. */
export function money(cents: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
		maximumFractionDigits: 2,
	}).format(cents / 100);
}

function per(cents: number, cycle: BillingCycle): string {
	return `${money(cents)} ${cycle === "monthly" ? "a month" : "a year"}`;
}

/** "October 25", or "October 25, 2027" with its year: US style, as spool.page's emails write dates. */
export function day(seconds: number, year = false): string {
	return new Date(seconds * 1000).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		...(year ? { year: "numeric" } : {}),
	});
}

const BRANDS: Record<string, string> = {
	amex: "American Express",
	diners: "Diners Club",
	jcb: "JCB",
	mastercard: "Mastercard",
	unionpay: "UnionPay",
	visa: "Visa",
	discover: "Discover",
};

function brand(name: string): string {
	return BRANDS[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
