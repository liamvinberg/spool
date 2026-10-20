import { useState } from "react";
import type { Comment } from "../../team-sync-protocol";
import { cn } from "../cn";
import { FilterIcon, PlusIcon, ResolveIcon } from "../icons";
import { IconButton } from "../primitives/actions";
import { Count, Dot } from "../primitives/display";
import { SelectTrigger } from "../primitives/inputs";
import { Menu, MenuItem, MenuSeparator } from "../primitives/overlays";
import { Segment, SegmentedControl, Switch } from "../primitives/selection";
import { ScrollArea, StatusLine } from "../primitives/structure";
import { AgentGlyph, ago, nameOf, Said, TeamLabel } from "./comments-layer";
import {
	counts,
	type Filters,
	type Group,
	groupsOf,
	inScope,
	isClosed,
	isUnread,
	lastSaid,
	listed,
	type Named,
	type Reader,
	type Show,
} from "./comments-model";
import { PaneActions } from "./pane-window";
import { PRESENCE_INK } from "./presence-faces";

/**
 * The Comments tab beside Properties and Agent (spool#170): the inbox of every comment this person can see, on this
 * page or the whole project, shown all, unread or for them, the resolved behind a switch; sorted and grouped from
 * its menu, by frame or by page. A row says who and when, the words, who reads it, its replies and whether it's
 * resolved; a click flies to its pin and opens it. Its + turns on the Comment tool.
 */
export function CommentsPane({
	comments,
	reader,
	people,
	page,
	project,
	filters,
	open,
	pinsHidden,
	onFilters,
	onPick,
	onNew,
	onTogglePins,
}: {
	comments: readonly Comment[];
	reader: Reader;
	people: readonly Named[];
	page: string;
	/** the project's name, at the foot */
	project: string;
	filters: Filters;
	/** the comment whose card is open */
	open: string | null;
	pinsHidden: boolean;
	onFilters: (filters: Filters) => void;
	onPick: (comment: Comment) => void;
	onNew: () => void;
	onTogglePins: () => void;
}) {
	const set = (change: Partial<Filters>) => onFilters({ ...filters, ...change });
	const scoped = inScope(comments, filters.scope, page);
	const said = counts(scoped, reader);
	const shown = listed(comments, filters, reader, page);
	const pageName = page === "" ? "root page" : page;
	return (
		<div className="flex h-full min-w-0 flex-col bg-surface-window" data-comments-pane="">
			<PaneActions>
				<IconButton size="sm" icon={<PlusIcon />} label="New comment (C)" onClick={onNew} />
			</PaneActions>
			<Head
				filters={filters}
				pageName={pageName}
				project={project}
				pinsHidden={pinsHidden}
				set={set}
				onTogglePins={onTogglePins}
			/>
			<div className="flex shrink-0 items-center gap-3 border-line-default border-b px-3 py-2">
				<SegmentedControl
					label="Show"
					size="sm"
					value={filters.show}
					onValueChange={(value) => set({ show: showOf(value) })}
				>
					<Segment value="all">all {said.open}</Segment>
					<Segment value="unread">unread {said.unread}</Segment>
					<Segment value="yours">for you {said.yours}</Segment>
				</SegmentedControl>
				<span className="ml-auto flex shrink-0 items-center gap-2 text-secondary type-label">
					<span aria-hidden="true">Resolved</span>
					<Switch
						aria-label="Show resolved"
						checked={filters.resolved}
						onCheckedChange={(resolved) => set({ resolved })}
					/>
				</span>
			</div>
			<ScrollArea className="flex-1">
				{shown.length === 0 ? (
					<div className="px-4 py-6 text-secondary type-label" data-comments-empty="">
						{filters.show === "unread"
							? "Nothing unread."
							: filters.show === "yours"
								? "Nothing here for you."
								: "No comments here yet. Press C and click a frame to leave one."}
					</div>
				) : (
					groupsOf(shown, filters.groupBy).map((group) => (
						<div key={group.key} className="pb-1" data-comments-group={group.key}>
							<div className="flex h-8 items-end gap-2 px-3 pb-1">
								<span className="min-w-0 truncate text-secondary type-value">
									<GroupHead group={group} filters={filters} />
								</span>
								<Count value={group.items.length} className="text-tertiary" />
							</div>
							{group.items.map((comment) => (
								<Row
									key={comment.id}
									comment={comment}
									reader={reader}
									people={people}
									lit={open === comment.id}
									showPlace={filters.groupBy === "page"}
									onClick={() => onPick(comment)}
								/>
							))}
						</div>
					))
				)}
			</ScrollArea>
			<StatusLine>
				<span>
					{said.open} open · {said.resolved} resolved
				</span>
				<span className="truncate">{filters.scope === "page" ? pageName : project}</span>
			</StatusLine>
		</div>
	);
}

const showOf = (value: string): Show => (value === "unread" || value === "yours" ? value : "all");

/** A group's head: its page in the whole project's list, then its frame or the field, or that its page is gone. */
function GroupHead({ group, filters }: { group: Group; filters: Filters }) {
	const pageName = group.page === "" ? "root page" : group.page;
	if (group.gone === "page")
		return (
			<>
				{pageName} <span className="text-danger-strong">page deleted</span>
			</>
		);
	if (filters.groupBy === "page") return <>{pageName}</>;
	const prefix = filters.scope === "project" ? `${pageName} / ` : "";
	if (group.gone === "frame")
		return (
			<>
				{prefix}
				{group.frame} <span className="text-danger-strong">deleted</span>
			</>
		);
	return <>{`${prefix}${group.frame ?? "on the field"}`}</>;
}

/** The pane's head: which comments (this page or the whole project), and the menu that sorts and groups them. */
function Head({
	filters,
	pageName,
	project,
	pinsHidden,
	set,
	onTogglePins,
}: {
	filters: Filters;
	pageName: string;
	project: string;
	pinsHidden: boolean;
	set: (change: Partial<Filters>) => void;
	onTogglePins: () => void;
}) {
	const [scopeOpen, setScopeOpen] = useState(false);
	const [menu, setMenu] = useState(false);
	return (
		<div className="flex h-bar shrink-0 items-center gap-1 border-line-default border-b pr-2 pl-2">
			<span className="relative">
				<SelectTrigger
					mono
					open={scopeOpen}
					onClick={() => setScopeOpen(!scopeOpen)}
					value={filters.scope === "page" ? pageName : "whole project"}
				/>
				{scopeOpen ? (
					<Menu className="absolute top-full left-0 z-50 mt-1 w-[220px]">
						<MenuItem
							label="This page"
							meta={pageName}
							checked={filters.scope === "page"}
							onClick={() => {
								set({ scope: "page" });
								setScopeOpen(false);
							}}
						/>
						<MenuItem
							label="Whole project"
							meta={project}
							checked={filters.scope === "project"}
							onClick={() => {
								set({ scope: "project" });
								setScopeOpen(false);
							}}
						/>
					</Menu>
				) : null}
			</span>
			<span className="relative ml-auto">
				<IconButton
					size="sm"
					icon={<FilterIcon />}
					label="Sort and group"
					aria-expanded={menu}
					onClick={() => setMenu(!menu)}
				/>
				{menu ? (
					<Menu className="absolute top-full right-0 z-50 mt-1 w-[220px]" data-comments-menu="">
						<MenuItem
							label="Newest first"
							checked={filters.sort === "newest"}
							onClick={() => set({ sort: "newest" })}
						/>
						<MenuItem
							label="Unread first"
							checked={filters.sort === "unread"}
							onClick={() => set({ sort: "unread" })}
						/>
						<MenuSeparator />
						<MenuItem
							label="Group by frame"
							checked={filters.groupBy === "frame"}
							onClick={() => set({ groupBy: "frame" })}
						/>
						<MenuItem
							label="Group by page"
							checked={filters.groupBy === "page"}
							onClick={() => set({ groupBy: "page" })}
						/>
						<MenuSeparator />
						<MenuItem
							label={pinsHidden ? "Show pins" : "Hide pins"}
							shortcut="⇧C"
							onClick={() => {
								setMenu(false);
								onTogglePins();
							}}
						/>
					</Menu>
				) : null}
			</span>
		</div>
	);
}

/** One comment in the list: unread dot, face, who and when, the words, then who reads it, replies and resolved. */
function Row({
	comment,
	reader,
	people,
	lit,
	showPlace,
	onClick,
}: {
	comment: Comment;
	reader: Reader;
	people: readonly Named[];
	lit: boolean;
	showPlace: boolean;
	onClick: () => void;
}) {
	const unread = isUnread(comment, reader);
	const closed = isClosed(comment);
	const replies = comment.replies.filter((reply) => reply.draftFor === null).length;
	const said = [comment, ...comment.replies].flatMap((message) => message.mentions ?? []);
	return (
		<button
			type="button"
			onClick={onClick}
			data-comment-row={comment.id}
			data-unread={unread ? "" : undefined}
			className={cn(
				"relative mx-1.5 flex w-[calc(100%-12px)] gap-2.5 rounded-sm py-2 pr-2.5 pl-4 text-left transition-colors duration-fast ease-out",
				lit ? "bg-state-selected-strong" : "hover:bg-state-hover",
			)}
		>
			{unread ? <Dot tone="accent" className="absolute top-[15px] left-1.5" /> : null}
			<span
				aria-hidden="true"
				className={cn(
					"mt-px inline-flex size-5 shrink-0 items-center justify-center font-semibold text-[10px] uppercase leading-none",
					comment.agent ? "rounded-[5px]" : "rounded-full",
					closed && "opacity-50",
				)}
				style={{ background: comment.author.color, color: PRESENCE_INK }}
			>
				{comment.agent ? <AgentGlyph /> : comment.author.name.charAt(0)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex h-5 items-center gap-2">
					<span className={cn("truncate type-control", unread ? "text-primary" : "text-primary/90")}>
						{nameOf(comment.author, comment.agent)}
					</span>
					{showPlace ? (
						<span className="truncate text-tertiary type-detail">{comment.frame ?? "on the field"}</span>
					) : null}
					<span className="ml-auto shrink-0 text-tertiary type-detail">{ago(lastSaid(comment))}</span>
				</span>
				<Said
					text={comment.body}
					people={[...people, ...said]}
					className={cn("line-clamp-2", closed && "text-secondary")}
				/>
				<span className="flex min-w-0 items-center gap-2 pt-0.5">
					<TeamLabel />
					{replies > 0 ? (
						<span className="shrink-0 text-secondary type-detail">
							{replies} {replies === 1 ? "reply" : "replies"}
						</span>
					) : null}
					{comment.editedSince === true ? (
						<span className="shrink-0 text-tertiary type-detail" data-comment-edited-since="">
							· edited since
						</span>
					) : null}
					{comment.standing === "deleted-page" ? (
						<span className="ml-auto shrink-0 text-danger-strong type-detail">page deleted</span>
					) : comment.resolved !== null ? (
						<span className="ml-auto flex shrink-0 items-center gap-1 text-secondary type-detail">
							<ResolveIcon done className="size-3 text-accent" />
							resolved
						</span>
					) : null}
				</span>
			</span>
		</button>
	);
}
