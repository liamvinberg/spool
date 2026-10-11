import { useState } from "react";
import type { CloudTeam } from "./api";
import { Button } from "./primitives/actions";
import { day, useBilling } from "./team-billing";

/**
 * A failing team's Home, for its admins: the last payment failed and Stripe is trying the card again. Everything
 * keeps working meanwhile, so it is one line above the covers, its failure in the danger ink, with Stripe's portal to
 * fix the card. Nobody else hears of it.
 */
export function TeamFailing({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	if (team.billing?.state !== "failing" || team.role !== "admin") return null;
	return <FailingLine key={team.address} team={team} onOpen={onOpen} />;
}

function FailingLine({ team, onOpen }: { team: CloudTeam; onOpen: (url: string) => void }) {
	const { summary, notice, manage } = useBilling(team, onOpen);
	const [busy, setBusy] = useState(false);
	// unread, the team list's word stands: the line says so, without a date, and why it couldn't say more
	if (summary === null ? notice === null : summary.state !== "failing") return null;
	const lapsesAt = summary?.lapsesAt ?? null;
	return (
		<div
			role="status"
			className="pj-billing-failing -mt-[8px] mb-[22px] flex min-h-[48px] items-center gap-[12px] border-line-default border-y py-[8px]"
			aria-busy={busy}
		>
			<span aria-hidden="true" className="size-[8px] shrink-0 rounded-full bg-danger" />
			<span className="min-w-0 flex-1 type-control">
				<span className="font-medium text-danger-strong">{team.name}’s last payment failed.</span>{" "}
				{lapsesAt === null
					? "Update the card to keep it syncing."
					: `Update the card before ${day(lapsesAt)} to keep it syncing.`}
				{notice && <span className="text-secondary"> {notice}</span>}
			</span>
			<Button
				disabled={busy}
				onClick={() => {
					setBusy(true);
					void manage().finally(() => setBusy(false));
				}}
			>
				Manage billing
			</Button>
		</div>
	);
}
