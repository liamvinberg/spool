import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
	type CloudAccountState,
	type CloudTeam,
	type CloudTeamInvite,
	type CloudTeamsState,
	fetchCloudTeams,
	TeamActionRefused,
	type TeamPeople,
	type TeamRole,
	teamActions,
} from "./api";
import { cn } from "./cn";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyFramesIcon, EmptyState } from "./empty-state";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "./home-actions";
import { CheckIcon, ChevronIcon, CogIcon, FrameIcon, PeopleIcon, PlusIcon } from "./icons";

/**
 * Home's teams: the switcher at the top of the sidebar, the invite line above the covers, and a team's
 * Projects, People and Settings. spool.page decides every rule; these screens ask and say what it said.
 */

type ReadyTeams = Extract<CloudTeamsState, { state: "ready" }>;
export type TeamPage = "projects" | "people" | "settings";

export const ROLE_LABEL: Record<TeamRole, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

/** spool.page's reasons, in Home's words. */
const SAYS: Record<string, string> = {
	last_admin: "You’re the only admin. Make someone else an admin first.",
	admin_required: "Only admins can do that.",
	already_member: "They’re already in the team.",
	invalid_mailbox: "Check the address and try again.",
	send_limit_reached: "Too many emails just now. Try again in a while.",
	address_taken: "Another team has that address.",
	address_reserved: "That address isn’t available.",
	invalid_address: "Use 2 to 40 lower-case letters, digits and hyphens.",
	invalid_name: "Give the team a name of up to 64 characters.",
	invalid_logo: "Use a PNG, JPEG, WebP or GIF.",
	logo_too_large: "Use an image under 100 KB.",
	team_creation_closed: "Creating a team isn’t open yet.",
	invite_expired: "That invite has run out. Ask for a new one.",
	invite_closed: "That invite is no longer open.",
	signed_out: "Sign in again to reach your teams.",
};

export function teamSays(error: unknown): string {
	const code = error instanceof TeamActionRefused ? error.code : "unreachable";
	return SAYS[code] ?? "spool.page can’t be reached just now. Try again.";
}

const HUES = ["#2E5D70", "#6B4E2E", "#4E3F70", "#2F6150", "#70393F"];

/** The team's logo, or its letter mark. */
export function TeamMark({
	team,
	size = 20,
}: {
	team: { address: string; name: string; logo: string | null };
	size?: number;
}) {
	if (team.logo)
		return (
			<img
				src={team.logo}
				alt=""
				className="shrink-0 rounded-[5px] object-cover"
				style={{ width: size, height: size }}
			/>
		);
	const hue = HUES[[...team.address].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % HUES.length];
	return (
		<span
			aria-hidden="true"
			className="grid shrink-0 place-items-center rounded-[5px] font-medium text-[#EDEDED]"
			style={{ width: size, height: size, background: hue, fontSize: Math.round(size * 0.52) }}
		>
			{[...team.name][0]?.toUpperCase()}
		</span>
	);
}

const MENU_ROW =
	"flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left text-text type-control hover:bg-surface";
const RULE = <div className="mx-[8px] my-[5px] h-px bg-border-raised" />;

/**
 * One team at a time: the switcher picks it, and your own projects are one more entry. A team you only
 * watch opens in the browser, since its projects never come to this Mac.
 */
export function TeamSwitcher({
	teams,
	current,
	onSelect,
	onNewTeam,
}: {
	teams: ReadyTeams;
	current: CloudTeam | null;
	onSelect: (address: string | null) => void;
	onNewTeam: () => void;
}) {
	const [open, setOpen] = useState(false);
	const choose = (address: string | null) => {
		setOpen(false);
		onSelect(address);
	};
	return (
		<div className="pj-team-switch relative mb-[18px] [@media(max-width:720px)]:hidden">
			<button
				type="button"
				className="flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface aria-expanded:bg-surface"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen(!open)}
			>
				{current ? <TeamMark team={current} /> : <OwnMark />}
				<span className="min-w-0 flex-1 truncate type-control">{current ? current.name : "Your projects"}</span>
				<span className="h-[10px] w-[10px] shrink-0 rotate-90 text-muted [&>svg]:h-full [&>svg]:w-full">
					<ChevronIcon />
				</span>
			</button>
			{open && (
				<>
					<button
						type="button"
						className="fixed inset-0 z-20 cursor-default"
						aria-label="Close menu"
						onClick={() => setOpen(false)}
					/>
					<div
						role="menu"
						className="absolute top-[calc(100%+6px)] left-0 z-30 w-[260px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]"
					>
						{teams.teams.map((team) =>
							team.role === "viewer" ? (
								<a
									key={team.id}
									role="menuitem"
									className={MENU_ROW}
									href={`${teams.origin}/${team.address}`}
									target="_blank"
									rel="noreferrer"
									onClick={() => setOpen(false)}
								>
									<TeamMark team={team} />
									<span className="min-w-0 flex-1 truncate">{team.name}</span>
									<span className="shrink-0 text-muted type-detail">viewer ↗</span>
								</a>
							) : (
								<button
									key={team.id}
									type="button"
									role="menuitem"
									className={cn(MENU_ROW, team.address === current?.address && "bg-surface")}
									onClick={() => choose(team.address)}
								>
									<TeamMark team={team} />
									<span className="min-w-0 flex-1 truncate">{team.name}</span>
									<span className="shrink-0 text-muted type-detail">
										{team.people} {team.people === 1 ? "person" : "people"}
									</span>
									{team.address === current?.address && <CheckIcon className="h-[12px] w-[12px] shrink-0" />}
								</button>
							),
						)}
						{teams.teams.length > 0 && RULE}
						<button
							type="button"
							role="menuitem"
							className={cn(MENU_ROW, !current && "bg-surface")}
							onClick={() => choose(null)}
						>
							<OwnMark />
							<span className="min-w-0 flex-1 truncate">Your projects</span>
							{!current && <CheckIcon className="h-[12px] w-[12px] shrink-0" />}
						</button>
						{RULE}
						<button
							type="button"
							role="menuitem"
							className={MENU_ROW}
							onClick={() => {
								setOpen(false);
								onNewTeam();
							}}
						>
							<span className="grid w-[20px] place-items-center text-muted [&>svg]:h-[10px] [&>svg]:w-[10px]">
								<PlusIcon />
							</span>
							<span className="flex-1">New team…</span>
						</button>
					</div>
				</>
			)}
		</div>
	);
}

function OwnMark() {
	return (
		<span className="grid h-[20px] w-[20px] shrink-0 place-items-center text-muted">
			<FrameIcon className="h-[16px] w-[16px]" />
		</span>
	);
}

/** An invite is news, so it is one quiet line where you already look: above the covers. */
export function InviteLine({
	invite,
	onJoin,
	onDecline,
}: {
	invite: CloudTeamInvite;
	onJoin: () => Promise<void>;
	onDecline: () => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const run = (action: () => Promise<void>) => {
		setBusy(true);
		setNotice(null);
		action().catch((error: unknown) => {
			setNotice(teamSays(error));
			setBusy(false);
		});
	};
	return (
		<div
			className="pj-invite-line flex min-h-[48px] items-center gap-[12px] border-border border-y py-[8px]"
			aria-busy={busy}
		>
			<TeamMark team={invite.team} />
			<span className="min-w-0 flex-1 type-control">
				{invite.invitedBy} invited you to {invite.team.name}.{" "}
				<span className="text-muted">
					{notice ??
						(invite.role === "viewer"
							? "You’d watch their projects live in the browser."
							: `You’d join as ${invite.role === "admin" ? "an admin" : "an editor"}.`)}
				</span>
			</span>
			<button
				type="button"
				className="px-[10px] text-muted type-control hover:text-text"
				disabled={busy}
				onClick={() => run(onDecline)}
			>
				Decline
			</button>
			<button type="button" className={cn(HOME_ACTION, "min-h-[30px]")} disabled={busy} onClick={() => run(onJoin)}>
				Join {invite.team.name}
			</button>
		</div>
	);
}

/** A team's nav under the switcher: Projects, People, and Settings for admins. */
export function TeamNav({ team, page, onPage }: { team: CloudTeam; page: TeamPage; onPage: (page: TeamPage) => void }) {
	const item = (to: TeamPage, icon: ReactNode, label: string, count?: number) => (
		<button
			type="button"
			className="pj-navigation-item flex h-[38px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left text-muted type-control [&:hover]:bg-surface [&:hover]:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text [&>svg]:h-[16px] [&>svg]:w-[16px] [&>svg]:shrink-0"
			aria-current={page === to ? "page" : undefined}
			onClick={() => onPage(to)}
		>
			{icon}
			<span className="flex-1">{label}</span>
			{count !== undefined && <span className="text-muted type-detail">{count}</span>}
		</button>
	);
	return (
		<>
			{item("projects", <FrameIcon />, "Projects")}
			{item("people", <PeopleIcon />, "People", team.people)}
			{team.role === "admin" && item("settings", <CogIcon />, "Settings")}
		</>
	);
}

/** A team's projects. Team projects arrive with sync; until then the page says there are none. */
export function TeamProjects({ team, notice }: { team: CloudTeam; notice?: ReactNode }) {
	return (
		<>
			<header className="pj-heading mb-[31px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">Projects</h1>
			</header>
			{notice}
			<EmptyState
				className="min-h-[420px] p-[35px] [&>p]:mt-0"
				icon={<EmptyFramesIcon />}
				title={`${team.name} has no projects yet`}
			/>
		</>
	);
}

type Confirming = { title: string; says: string; label: string; act: () => Promise<void> };

/** One row per member and a role menu for admins. A change that takes something away asks first. */
export function TeamPeoplePage({ team, onChanged }: { team: CloudTeam; onChanged: () => void }) {
	const [people, setPeople] = useState<TeamPeople | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<Confirming | null>(null);
	const [menu, setMenu] = useState<string | null>(null);
	const admin = team.role === "admin";
	const load = useCallback(async () => {
		try {
			setPeople(await teamActions.people(team.address));
		} catch (error) {
			setNotice(teamSays(error));
		}
	}, [team.address]);
	useEffect(() => {
		void load();
	}, [load]);
	const act = async (action: () => Promise<unknown>, done?: string) => {
		setNotice(null);
		try {
			await action();
			if (done) setNotice(done);
		} catch (error) {
			setNotice(teamSays(error));
		}
		await load();
		onChanged();
	};
	const changeRole = (person: TeamPeople["members"][number], role: TeamRole) => {
		setMenu(null);
		const change = () => teamActions.setRole(team.address, person.accountId, role);
		if (person.role !== "viewer" && role === "viewer")
			setConfirming({
				title: person.you ? "Make yourself a viewer?" : `Make ${person.email} a viewer?`,
				says: `${person.you ? "This" : "Their"} Mac stops syncing ${team.name}. The folders stay on it.`,
				label: "Make viewer",
				act: async () => {
					await change();
				},
			});
		else void act(change);
	};
	const remove = (person: TeamPeople["members"][number]) => {
		setMenu(null);
		setConfirming(
			person.you
				? {
						title: `Leave ${team.name}?`,
						says: `The folders stay on this Mac as ordinary projects. Pages ${team.name} shared keep working.`,
						label: `Leave ${team.name}`,
						act: async () => {
							await teamActions.removeMember(team.address, person.accountId);
						},
					}
				: {
						title: `Remove ${person.email} from ${team.name}?`,
						says: `They lose ${team.name}’s projects at once. Folders on their Mac stay as ordinary projects.`,
						label: "Remove",
						act: async () => {
							await teamActions.removeMember(team.address, person.accountId);
						},
					},
		);
	};
	return (
		<div className="pj-team-people max-w-[880px]">
			<header className="pj-heading mb-[10px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">People</h1>
			</header>
			<p className="mb-[22px] text-muted type-detail">
				{people ? `${people.members.length} ${people.members.length === 1 ? "person" : "people"}` : " "}
			</p>
			<InviteForm
				admin={admin}
				onInvite={(email, role) => act(() => teamActions.invite(team.address, email, role), "Invite sent.")}
			/>
			{notice && (
				<p role="status" className="mb-[14px] type-control">
					{notice}
				</p>
			)}
			<ul className="flex flex-col border-border border-b">
				{people?.members.map((person) => (
					<li key={person.accountId} className="flex h-[58px] items-center gap-[14px] border-border border-t">
						<Face email={person.email} />
						<span className="min-w-0 flex-1 truncate type-control">
							{person.email}
							{person.you && <span className="text-muted"> (you)</span>}
						</span>
						{admin ? (
							<span className="relative shrink-0">
								<button
									type="button"
									className="flex h-[30px] items-center gap-[8px] rounded-[6px] border border-transparent px-[10px] type-control hover:border-border-raised aria-expanded:border-border-raised aria-expanded:bg-raised"
									aria-expanded={menu === person.accountId}
									aria-label={`Role of ${person.email}`}
									onClick={() => setMenu(menu === person.accountId ? null : person.accountId)}
								>
									{ROLE_LABEL[person.role]}
									<span className="h-[9px] w-[9px] rotate-90 text-muted [&>svg]:h-full [&>svg]:w-full">
										<ChevronIcon />
									</span>
								</button>
								{menu === person.accountId && (
									<>
										<button
											type="button"
											className="fixed inset-0 z-20 cursor-default"
											aria-label="Close menu"
											onClick={() => setMenu(null)}
										/>
										<div
											role="menu"
											className="absolute top-[36px] right-0 z-30 w-[220px] animate-menu-in rounded-[9px] border border-border-raised bg-raised p-[5px]"
										>
											{(["admin", "editor", "viewer"] as const).map((role) => (
												<button
													key={role}
													type="button"
													role="menuitem"
													className={MENU_ROW}
													onClick={() => changeRole(person, role)}
												>
													<span className="w-[14px] shrink-0">
														{role === person.role && <CheckIcon className="h-[12px] w-[12px]" />}
													</span>
													{ROLE_LABEL[role]}
												</button>
											))}
											{RULE}
											<button
												type="button"
												role="menuitem"
												className={cn(MENU_ROW, "pl-[33px] text-thread")}
												onClick={() => remove(person)}
											>
												{person.you ? `Leave ${team.name}` : `Remove from ${team.name}`}
											</button>
										</div>
									</>
								)}
							</span>
						) : (
							<>
								<span className="w-[86px] shrink-0 text-muted type-control">{ROLE_LABEL[person.role]}</span>
								<span className="w-[80px] shrink-0 text-right">
									{person.you && (
										<button type="button" className={HOME_ACTION} onClick={() => remove(person)}>
											Leave
										</button>
									)}
								</span>
							</>
						)}
					</li>
				))}
			</ul>
			{people && people.invites.length > 0 && (
				<>
					<h2 className="mt-[34px] mb-[8px] flex items-baseline gap-[10px] type-title">
						Invited <span className="text-muted type-detail">{people.invites.length}</span>
					</h2>
					<ul className="flex flex-col">
						{people.invites.map((invite) => (
							<li key={invite.id} className="flex h-[58px] items-center gap-[14px] border-border border-t">
								<span className="h-[30px] w-[30px] shrink-0 rounded-full border border-muted/60 border-dashed" />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className={cn("truncate type-control", invite.expired && "text-muted")}>
										{invite.email}
									</span>
									<span className="truncate text-muted type-detail">
										{ROLE_LABEL[invite.role].toLowerCase()} ·{" "}
										{invite.expired
											? "expired"
											: `sent by ${invite.invitedBy} · ${daysLeft(invite.expiresAt)}`}
									</span>
								</span>
								{(admin || invite.role === "viewer") && (
									<>
										<button
											type="button"
											className="h-[28px] rounded-[6px] px-[8px] text-muted type-control hover:bg-raised hover:text-text"
											onClick={() =>
												void act(
													() => teamActions.resendInvite(team.address, invite.id),
													"Invite sent again.",
												)
											}
										>
											Resend
										</button>
										<button
											type="button"
											className="h-[28px] rounded-[6px] px-[8px] text-muted type-control hover:bg-raised hover:text-text"
											onClick={() => void act(() => teamActions.cancelInvite(team.address, invite.id))}
										>
											Cancel
										</button>
									</>
								)}
							</li>
						))}
					</ul>
				</>
			)}
			{confirming && (
				<ConfirmDialog
					title={confirming.title}
					description={confirming.says}
					confirmLabel={confirming.label}
					danger
					onConfirm={async () => {
						try {
							await confirming.act();
						} catch (error) {
							throw new Error(teamSays(error));
						} finally {
							await load();
							onChanged();
						}
					}}
					onClose={() => setConfirming(null)}
				/>
			)}
		</div>
	);
}

function daysLeft(expiresAt: number): string {
	const days = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 86_400_000));
	return days === 1 ? "1 day left" : `${days} days left`;
}

function Face({ email }: { email: string }) {
	return (
		<span
			className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-control text-text uppercase type-detail"
			aria-hidden="true"
		>
			{email.slice(0, 1)}
		</span>
	);
}

/** An address and a role. Admins invite anyone; everyone else invites viewers. */
function InviteForm({
	admin,
	onInvite,
}: {
	admin: boolean;
	onInvite: (email: string, role: TeamRole) => Promise<void>;
}) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<TeamRole>(admin ? "editor" : "viewer");
	const [busy, setBusy] = useState(false);
	return (
		<form
			className="mb-[22px] flex items-center gap-[10px]"
			onSubmit={(event) => {
				event.preventDefault();
				setBusy(true);
				void onInvite(email.trim(), role).finally(() => {
					setBusy(false);
					setEmail("");
				});
			}}
		>
			<input
				type="email"
				required
				value={email}
				onChange={(event) => setEmail(event.target.value)}
				placeholder="Email address"
				aria-label="Email address"
				className="h-[38px] min-w-0 flex-1 rounded-[7px] border border-border-raised bg-bg px-[11px] text-text outline-none type-control placeholder:text-muted focus:border-muted"
			/>
			<select
				value={role}
				aria-label="Role"
				onChange={(event) => setRole(event.target.value as TeamRole)}
				className="h-[38px] cursor-pointer rounded-[7px] border border-border-raised bg-transparent px-[9px] text-text type-control"
			>
				{(admin ? (["admin", "editor", "viewer"] as const) : (["viewer"] as const)).map((option) => (
					<option key={option} value={option} className="bg-surface">
						as {ROLE_LABEL[option]}
					</option>
				))}
			</select>
			<button type="submit" className={cn(HOME_ACTION_PRIMARY, "h-[38px]")} disabled={busy}>
				Invite
			</button>
		</form>
	);
}

/** Logo, name, address and Delete team, in that order. Admins only; spool.page refuses anyone else. */
export function TeamSettingsPage({
	team,
	origin,
	onChanged,
	onMoved,
	onDeleted,
}: {
	team: CloudTeam;
	origin: string;
	onChanged: () => void;
	onMoved: (address: string) => void;
	onDeleted: () => void;
}) {
	const [name, setName] = useState(team.name);
	const [address, setAddress] = useState(team.address);
	const [notice, setNotice] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const file = useRef<HTMLInputElement>(null);
	useEffect(() => {
		setName(team.name);
		setAddress(team.address);
	}, [team.name, team.address]);
	const act = async (action: () => Promise<unknown>) => {
		setNotice(null);
		try {
			await action();
			setNotice("Saved.");
		} catch (error) {
			setNotice(teamSays(error));
		}
		onChanged();
	};
	const row = (label: string, says: string | null, control: ReactNode, top = true) => (
		<div className={cn("flex items-center justify-between gap-[40px] py-[18px]", top && "border-border border-t")}>
			<span className="flex min-w-0 flex-col gap-[4px]">
				<span className="type-control">{label}</span>
				{says && <span className="max-w-[400px] text-muted type-label">{says}</span>}
			</span>
			<span className="flex shrink-0 items-center gap-[8px]">{control}</span>
		</div>
	);
	const field =
		"h-[34px] rounded-[7px] border border-border-raised bg-bg px-[11px] text-text outline-none type-control focus:border-muted";
	return (
		<div className="pj-team-settings max-w-[720px]">
			<header className="pj-heading mb-[28px] flex h-[35px] items-center">
				<h1 className="type-page font-medium">Settings</h1>
			</header>
			{notice && (
				<p role="status" className="mb-[14px] type-control">
					{notice}
				</p>
			)}
			{row(
				"Logo",
				"Shows in the switcher and on the team’s page.",
				<>
					<TeamMark team={team} size={40} />
					<input
						ref={file}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						className="hidden"
						aria-label="Logo"
						onChange={(event) => {
							const chosen = event.target.files?.[0];
							event.target.value = "";
							if (chosen) void act(async () => teamActions.setLogo(team.address, await base64(chosen)));
						}}
					/>
					<button type="button" className={cn(HOME_ACTION, "ml-[8px]")} onClick={() => file.current?.click()}>
						Upload…
					</button>
					<button
						type="button"
						className={HOME_ACTION}
						disabled={!team.logo}
						onClick={() => void act(() => teamActions.removeLogo(team.address))}
					>
						Remove
					</button>
				</>,
				false,
			)}
			{row(
				"Name",
				null,
				<form
					className="flex gap-[8px]"
					onSubmit={(event) => {
						event.preventDefault();
						void act(() => teamActions.update(team.address, { name }));
					}}
				>
					<input
						className={cn(field, "w-[240px]")}
						value={name}
						maxLength={64}
						aria-label="Name"
						onChange={(event) => setName(event.target.value)}
					/>
					<button type="submit" className={HOME_ACTION} disabled={name.trim() === team.name}>
						Save
					</button>
				</form>,
			)}
			{row(
				"Address",
				null,
				<form
					className="flex gap-[8px]"
					onSubmit={(event) => {
						event.preventDefault();
						void act(async () => onMoved((await teamActions.update(team.address, { address })).address));
					}}
				>
					<span className={cn(field, "flex w-[260px] items-center")}>
						<span className="text-muted type-value">{new URL(origin).host}/</span>
						<input
							className="min-w-0 flex-1 bg-transparent text-text outline-none type-value"
							value={address}
							maxLength={40}
							aria-label="Address"
							onChange={(event) => setAddress(event.target.value.toLowerCase())}
						/>
					</span>
					<button type="submit" className={HOME_ACTION} disabled={address === team.address}>
						Save
					</button>
				</form>,
			)}
			{row(
				"Delete team",
				"Everyone loses access at once. Gone for good after 30 days.",
				<button
					type="button"
					className="inline-flex h-[34px] items-center rounded-[7px] border border-thread/50 px-[13px] text-thread type-control hover:bg-thread/10"
					onClick={() => setDeleting(true)}
				>
					Delete {team.name}…
				</button>,
			)}
			{deleting && (
				<ConfirmDialog
					title={`Delete ${team.name}?`}
					description="Everyone loses access at once. Gone for good after 30 days."
					confirmLabel={`Delete ${team.name}`}
					danger
					onConfirm={async () => {
						try {
							await teamActions.delete(team.address);
						} catch (error) {
							throw new Error(teamSays(error));
						}
						onDeleted();
					}}
					onClose={() => setDeleting(false)}
				/>
			)}
		</div>
	);
}

async function base64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let start = 0; start < bytes.length; start += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
	return btoa(binary);
}

/** "New team…": a name, and spool.page decides whether this account may start one yet. */
export function NewTeamDialog({
	allowed,
	onCreate,
	onClose,
}: {
	allowed: boolean;
	onCreate: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	if (!allowed)
		return (
			<ConfirmDialog
				title="New team"
				description="Creating a team isn’t open yet."
				confirmLabel="OK"
				onConfirm={async () => {}}
				onClose={onClose}
			/>
		);
	return (
		<ConfirmDialog
			title="New team"
			confirmLabel="Create team"
			disabled={name.trim() === ""}
			onConfirm={async () => {
				try {
					await onCreate(name.trim());
				} catch (error) {
					throw new Error(teamSays(error));
				}
			}}
			onClose={onClose}
		>
			<label className="mb-[4px] flex flex-col gap-[8px] type-control">
				Name
				<input
					value={name}
					maxLength={64}
					onChange={(event) => setName(event.target.value)}
					className="h-[38px] rounded-[7px] border border-border-raised bg-bg px-[11px] text-text outline-none focus:border-muted"
				/>
			</label>
		</ConfirmDialog>
	);
}

/**
 * Home's teams, wired: reads this Mac's teams once it is signed in, keeps which one Home shows, and hands
 * Home its switcher, its invite lines and, while a team is chosen, that team's nav and page.
 */
export function useTeamHome(account: CloudAccountState, open: (url: string) => void) {
	const [teams, setTeams] = useState<CloudTeamsState>({ state: "unreachable" });
	const [scope, setScope] = useState<string | null>(null);
	const [page, setPage] = useState<TeamPage>("projects");
	const [creating, setCreating] = useState(false);
	const signedIn = account.state === "signed-in" ? account.email : null;
	const refresh = useCallback(async () => setTeams(await fetchCloudTeams()), []);
	useEffect(() => {
		if (signedIn) void refresh();
		else setTeams({ state: "signed-out" });
	}, [signedIn, refresh]);
	const ready = teams.state === "ready" ? teams : null;
	const current = ready?.teams.find((team) => team.address === scope && team.role !== "viewer") ?? null;
	const select = (address: string | null) => {
		setScope(address);
		setPage("projects");
	};
	if (!ready) return { switcher: undefined, notice: undefined, team: undefined };
	const switcher = (
		<>
			<TeamSwitcher teams={ready} current={current} onSelect={select} onNewTeam={() => setCreating(true)} />
			{creating && (
				<NewTeamDialog
					allowed={ready.mayCreateTeam}
					onCreate={async (name) => {
						const created = await teamActions.create(name);
						await refresh();
						select(created.address);
					}}
					onClose={() => setCreating(false)}
				/>
			)}
		</>
	);
	const notice =
		ready.invites.length > 0 ? (
			<div className="pj-invites -mt-[8px] mb-[22px] flex flex-col">
				{ready.invites.map((invite) => (
					<InviteLine
						key={invite.id}
						invite={invite}
						onDecline={async () => {
							await teamActions.decline(invite.id);
							await refresh();
						}}
						onJoin={async () => {
							const joined = await teamActions.accept(invite.id);
							await refresh();
							if (joined.role === "viewer") open(`${ready.origin}/${joined.address}`);
							else select(joined.address);
						}}
					/>
				))}
			</div>
		) : undefined;
	const team = current
		? {
				nav: <TeamNav team={current} page={page} onPage={setPage} />,
				main:
					page === "people" ? (
						<TeamPeoplePage key={current.address} team={current} onChanged={() => void refresh()} />
					) : page === "settings" && current.role === "admin" ? (
						<TeamSettingsPage
							key={current.id}
							team={current}
							origin={ready.origin}
							onChanged={() => void refresh()}
							onMoved={(address) => setScope(address)}
							onDeleted={() => {
								select(null);
								void refresh();
							}}
						/>
					) : (
						<TeamProjects team={current} notice={notice} />
					),
			}
		: undefined;
	return { switcher, notice, team };
}
