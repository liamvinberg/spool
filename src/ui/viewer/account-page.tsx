import { type ReactNode, useCallback, useEffect, useState } from "react";
import { personName } from "../../person-name";
import { cn } from "../cn";
import { Button } from "../primitives/actions";
import { TextField } from "../primitives/inputs";
import { Segment, SegmentedControl } from "../primitives/selection";
import type { AccountSource, AccountSummary, CommentEmails } from "./account-source";

/**
 * spool.page/account, in Home's sidebar like a team's pages: who is signed in and their name, whether they get
 * comment emails, the Macs signed in as them, their passkeys and the way out of this browser. Passkeys are made here, since a passkey belongs to spool.page.
 */
export function AccountPage({
	source,
	teams,
	onSignedOut,
	onSignOut,
}: {
	source: AccountSource;
	/** the teams this account is in, by name; undefined until Home has read them */
	teams: readonly string[] | undefined;
	/** this browser's session ended somewhere else */
	onSignedOut: () => void;
	onSignOut: () => void;
}) {
	const [summary, setSummary] = useState<AccountSummary | undefined>();
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [refused, setRefused] = useState(false);
	const read = useCallback(async () => {
		const next = await source.summary();
		if (next === null) onSignedOut();
		else setSummary(next);
	}, [source, onSignedOut]);
	useEffect(() => {
		read().catch(() => setNotice(UNREACHABLE));
	}, [read]);
	const act = async (key: string, action: () => Promise<void>, quiet = false) => {
		setBusy(key);
		setNotice(null);
		setRefused(false);
		try {
			await action();
		} catch (error) {
			if (error instanceof NameRefused) setRefused(true);
			else if (!quiet) setNotice(UNREACHABLE);
		}
		await read().catch(() => setNotice(UNREACHABLE));
		setBusy(null);
	};
	const now = Date.now() / 1000;
	return (
		<div className="pj-account-page max-w-[720px]">
			<header className="pj-heading mb-[6px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">Account</h1>
			</header>
			{notice && (
				<p role="status" className="mt-[14px] type-control">
					{notice}
				</p>
			)}
			{summary && (
				<>
					<div className="flex items-center gap-[12px] pt-[14px]">
						<span
							className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-surface-control text-primary uppercase type-control"
							aria-hidden="true"
						>
							{[...personName(summary)][0]}
						</span>
						<span className="flex min-w-0 flex-col gap-[2px]">
							<span className="truncate type-control">{personName(summary)}</span>
							<span className="truncate text-secondary type-label">
								{summary.email}
								{teams && (
									<>
										{" · "}
										<span>{teamsLine(teams)}</span>
									</>
								)}
							</span>
						</span>
					</div>

					<Group
						title="Name"
						says="What everyone else sees of you: on your pointer, your comments and what you share."
					>
						<NameRow
							key={summary.name ?? ""}
							summary={summary}
							busy={busy !== null}
							onRename={(name) =>
								act("name", async () => {
									if (!(await source.rename(name))) throw new NameRefused();
								})
							}
							refused={refused}
						/>
					</Group>

					{summary.commentEmails !== undefined && (
						<Group
							title="Comment emails"
							says="One email a few minutes after a comment is meant for you, unless you read it first."
						>
							<Row
								title="Comments for you"
								says="Mentions of you, replies in comments you’re in, and outsiders’ comments on shares you made. Every email can turn them off too."
								control={
									<SegmentedControl
										label="Comment emails"
										value={summary.commentEmails}
										onValueChange={(value) => {
											const emails: CommentEmails = value === "off" ? "off" : "for-you";
											void act("emails", () => source.setCommentEmails(emails));
										}}
									>
										<Segment value="for-you" disabled={busy !== null}>
											For you
										</Segment>
										<Segment value="off" disabled={busy !== null}>
											Off
										</Segment>
									</SegmentedControl>
								}
							/>
						</Group>
					)}

					<Group
						title="Macs"
						says="Each Mac signed in as you. Revoke one you no longer use and it signs out the next time it asks."
					>
						{summary.macs.length === 0 ? (
							<Row title="No Macs are signed in." quiet />
						) : (
							summary.macs.map((mac) => (
								<Row
									key={mac.id}
									title={mac.name}
									says={`Signed in ${day(mac.signedInAt, now)} · used ${day(mac.usedAt, now)}`}
									control={
										<Button
											size="sm"
											aria-label={`Revoke ${mac.name}`}
											loading={busy === `mac:${mac.id}`}
											disabled={busy !== null}
											onClick={() => void act(`mac:${mac.id}`, () => source.revokeMac(mac.id))}
										>
											Revoke
										</Button>
									}
								/>
							))
						)}
					</Group>

					<Group
						title="Passkeys"
						says="Sign in with Touch ID instead of an email code."
						action={
							source.passkeys() && (
								<Button
									size="sm"
									loading={busy === "add"}
									disabled={busy !== null}
									// cancelling the browser's own prompt is no failure worth a line
									onClick={() => void act("add", () => source.addPasskey(), true)}
								>
									Add a passkey
								</Button>
							)
						}
					>
						{summary.passkeys.length === 0 ? (
							<Row title="No passkeys yet." quiet />
						) : (
							summary.passkeys.map((passkey, index) => (
								<Row
									key={passkey.id}
									title={summary.passkeys.length === 1 ? "Passkey" : `Passkey ${index + 1}`}
									says={`Added ${day(passkey.addedAt, now)}${passkey.usedAt === null ? "" : ` · used ${day(passkey.usedAt, now)}`}`}
									control={
										<Button
											size="sm"
											loading={busy === `passkey:${passkey.id}`}
											disabled={busy !== null}
											onClick={() =>
												void act(`passkey:${passkey.id}`, () => source.removePasskey(passkey.id))
											}
										>
											Remove
										</Button>
									}
								/>
							))
						)}
					</Group>

					<Group title="This browser">
						<Row
							title="Sign out"
							says="Signs out of spool.page here. Your Macs stay signed in."
							control={
								<Button size="sm" onClick={onSignOut}>
									Sign out
								</Button>
							}
						/>
					</Group>
				</>
			)}
		</div>
	);
}

const UNREACHABLE = "spool.page can’t be reached just now. Try again.";

/** spool.page took no name: it said why only as a refusal, and the row says the rule. */
class NameRefused extends Error {}

/** The account's name, typed over and saved; empty, it says what everyone sees until there is one. */
function NameRow({
	summary,
	busy,
	refused,
	onRename,
}: {
	summary: AccountSummary;
	busy: boolean;
	refused: boolean;
	onRename: (name: string) => void;
}) {
	const [draft, setDraft] = useState(summary.name ?? "");
	const typed = draft.trim();
	return (
		<form
			className="flex min-h-[58px] flex-col justify-center gap-[6px] border-line-default border-t py-[12px]"
			onSubmit={(event) => {
				event.preventDefault();
				onRename(typed);
			}}
		>
			<span className="flex gap-[8px]">
				<TextField
					size="lg"
					className="w-[280px]"
					value={draft}
					onValueChange={setDraft}
					placeholder={personName({ email: summary.email })}
					label="Name"
					error={refused}
				/>
				<Button type="submit" disabled={busy || typed === "" || typed === summary.name}>
					Save
				</Button>
			</span>
			{refused && (
				<span role="alert" className="text-danger-strong type-label">
					A name is 1 to 64 characters, with no hidden ones.
				</span>
			)}
		</form>
	);
}

function Group({
	title,
	says,
	action,
	children,
}: {
	title: string;
	says?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="mt-[36px]" aria-label={title}>
			<header className="mb-[12px] flex items-end justify-between gap-[16px]">
				<span className="flex flex-col gap-[3px]">
					<h2 className="type-title">{title}</h2>
					{says && <span className="text-secondary type-label">{says}</span>}
				</span>
				{action}
			</header>
			<div className="flex flex-col border-line-default border-b">{children}</div>
		</section>
	);
}

function Row({
	title,
	says,
	control,
	quiet = false,
}: {
	title: string;
	says?: string;
	control?: ReactNode;
	quiet?: boolean;
}) {
	return (
		<div className="flex min-h-[58px] items-center justify-between gap-[32px] border-line-default border-t py-[12px]">
			<span className="flex min-w-0 flex-col gap-[3px]">
				<span className={cn("truncate type-control", quiet && "text-secondary")}>{title}</span>
				{says && <span className="text-secondary type-label">{says}</span>}
			</span>
			{control && <span className="flex shrink-0 items-center gap-[8px]">{control}</span>}
		</div>
	);
}

/** "In Tidemark and Northlight.", or that there is no team yet. */
export function teamsLine(teams: readonly string[]): string {
	if (teams.length === 0) return "Not in a team yet.";
	if (teams.length === 1) return `In ${teams[0]}.`;
	return `In ${teams.slice(0, -1).join(", ")} and ${teams.at(-1)}.`;
}

/** A day as people say it: today, yesterday, 8 Oct, or 8 Oct 2025 in another year. */
export function day(seconds: number, now: number): string {
	const at = new Date(seconds * 1000);
	const today = new Date(now * 1000);
	const days = Math.round((startOfDay(today) - startOfDay(at)) / 86_400_000);
	if (days === 0) return "today";
	if (days === 1) return "yesterday";
	return new Intl.DateTimeFormat("en-GB", {
		day: "numeric",
		month: "short",
		...(at.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
	}).format(at);
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
