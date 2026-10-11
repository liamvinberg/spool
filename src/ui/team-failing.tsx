import { useContext, useEffect, useState } from "react";
import type { BillingSummary, CloudTeam } from "./api";
import { Button } from "./primitives/actions";
import { day } from "./team-billing";
import { TeamsSourceContext, teamSays } from "./teams";

/**
 * A failing team's Home, for its admins: the last payment failed and Stripe is trying the card again. Everything
 * keeps working meanwhile, so it is one line above the covers, with Stripe's portal to fix the card. Nobody else
 * hears of it.
 */
export function TeamFailing({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	if (team.billing?.state !== "failing" || team.role !== "admin") return null;
	return <FailingLine key={team.address} team={team} onOpen={onOpen} />;
}

function FailingLine({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	const source = useContext(TeamsSourceContext);
	const [summary, setSummary] = useState<BillingSummary | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	useEffect(() => {
		let current = true;
		void source.billing(team.address).then(
			(read) => {
				if (current) setSummary(read);
			},
			() => {},
		);
		return () => {
			current = false;
		};
	}, [source, team.address]);
	if (summary === null || summary.state !== "failing") return null;
	const manage = () => {
		setBusy(true);
		setNotice(null);
		source.portal(team.address).then(
			({ url }) => {
				setBusy(false);
				onOpen(url);
			},
			(error: unknown) => {
				setNotice(teamSays(error));
				setBusy(false);
			},
		);
	};
	return (
		<div
			role="status"
			className="pj-billing-failing -mt-[8px] mb-[22px] flex min-h-[48px] items-center gap-[12px] border-line-default border-y py-[8px]"
			aria-busy={busy}
		>
			<span className="min-w-0 flex-1 type-control">
				{team.name}’s last payment failed.{" "}
				{summary.lapsesAt === null
					? "Update the card to keep it syncing."
					: `Update the card before ${day(summary.lapsesAt)} to keep it syncing.`}
				{notice && <span className="text-secondary"> {notice}</span>}
			</span>
			<Button disabled={busy} onClick={manage}>
				Manage billing
			</Button>
		</div>
	);
}
