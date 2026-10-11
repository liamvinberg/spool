import { type ReactNode, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { BillingCycle, BillingSummary, CloudTeam, TeamPeople } from "./api";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { Button } from "./primitives/actions";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "./primitives/overlays";
import { checkoutStarted, PayChoice } from "./team-billing";
import { TeamsSourceContext, teamSays } from "./teams";

/**
 * A lapsed team's Home: it has no paid time left and has gone local. Its admins get one dialog to pay for it again,
 * once it has had time; everyone else gets one line. spool.page says the state; this only says it.
 */
export function TeamLapsed({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	if (team.billing?.state !== "lapsed") return null;
	const hadTime = team.billing.hadTime !== false;
	// a team that never had time is paid for from its setup list and Billing
	if (team.role === "admin") return hadTime ? <TrialEndDialog key={team.address} team={team} onOpen={onOpen} /> : null;
	return (
		<p
			role="status"
			className="pj-gone-local -mt-[8px] mb-[22px] flex min-h-[48px] items-center border-line-default border-y py-[8px] type-control"
		>
			{hadTime
				? `${team.name} has gone local. Ask an admin to pay for it to sync again.`
				: `${team.name} isn’t paid for yet. Ask an admin to pay for it to sync.`}
		</p>
	);
}

/**
 * The trial's end, or a paid team's lapse, asking an admin the one question Billing asks: who stays an editor, and
 * monthly or yearly. A team that never had time is paid for from its setup list and Billing instead. Closed, it stays
 * closed while the team's Projects page is up, and comes back the next time it opens.
 */
function TrialEndDialog({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	const source = useContext(TeamsSourceContext);
	const [read, setRead] = useState<{ summary: BillingSummary; people: TeamPeople } | null>(null);
	const [closed, setClosed] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	useEffect(() => {
		if (closed) return;
		let current = true;
		void Promise.all([source.billing(team.address), source.people(team.address)]).then(
			([summary, people]) => {
				if (current) setRead({ summary, people });
			},
			() => {},
		);
		return () => {
			current = false;
		};
	}, [source, team.address, closed]);
	if (closed || read === null || read.summary.state !== "lapsed" || !read.summary.hadTime) return null;
	const close = () => setClosed(true);
	const pay = async (editors: string[], cycle: BillingCycle) => {
		setNotice(null);
		try {
			const { url } = await source.checkout(team.address, editors, cycle);
			checkoutStarted(team.address);
			close();
			onOpen(url);
		} catch (error) {
			setNotice(teamSays(error));
		}
	};
	return (
		<Modal
			title={read.summary.paidBefore === true ? `${team.name} has gone local` : `${team.name}’s trial has ended`}
			description="Choose who stays an editor and pay to keep syncing. Anyone left out becomes a viewer."
			onClose={close}
		>
			<DialogBody notice={notice}>
				<PayChoice people={read.people} prices={read.summary.prices} onPay={pay} />
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" onClick={close}>
					Not now
				</Button>
			</DialogFooter>
		</Modal>
	);
}

/** The dialog itself, over Home: opened modal, closed by Escape or Not now. */
function Modal({
	title,
	description,
	onClose,
	children,
}: {
	title: string;
	description: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const id = useId();
	const ref = useRef<HTMLDialogElement>(null);
	// modal: the app's own keys (New project, Open, Settings) wait behind it
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	useLayoutEffect(() => {
		const dialog = ref.current;
		if (dialog?.open === false) dialog.showModal?.();
		return () => dialog?.close?.();
	}, []);
	return (
		<Dialog
			native
			ref={ref}
			width="free"
			className="pj-trial-ended w-[560px]"
			aria-labelledby={`${id}-title`}
			aria-describedby={`${id}-description`}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<DialogHeader
				title={title}
				titleId={`${id}-title`}
				description={description}
				descriptionId={`${id}-description`}
			/>
			{children}
		</Dialog>
	);
}
