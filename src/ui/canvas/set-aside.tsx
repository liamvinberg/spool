import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dismissSetAside, fetchSetAside, putSetAsideBack, type ShownSetAside } from "../api";
import { Button } from "../primitives/actions";
import { Count } from "../primitives/display";
import { TextAction } from "../primitives/feedback";
import { Popover } from "../primitives/overlays";

/**
 * A team project's collisions that this copy lost, said on its canvas as a quiet count.
 *
 * When this machine's save reaches the team after another to the same file, the sync merges the two the way git
 * would, and nobody hears of it. Only where both changed the same lines does a save stay set aside: the team keeps
 * the other, this machine's disk takes it, and this copy alone is told. The agent that wrote the file hears of it on
 * its next command; a person sees `1 set aside` after who's here on the path, which nothing announces, and opens it
 * to a list of the collisions, each with three ways on. Use theirs lets this copy's side go. Use mine writes it again,
 * which travels as an ordinary new save on top. Ask agent to fix starts one new thread with the collision's files in
 * it, and only when pressed. A delete of this copy's that another's edit undid is told the same way, since an edit
 * beats a delete. The other save may be this same account's from another local copy, and is said as such.
 */

/** Whether every mark in a collision lost to this account's own other copy, and that copy's machine when one is named. */
function otherCopy(marks: readonly ShownSetAside[]): { device: string | null } | null {
	if (marks.length === 0 || !marks.every((mark) => mark.self)) return null;
	const devices = new Set(marks.map((mark) => mark.device));
	const [only] = devices;
	return { device: devices.size === 1 && only !== undefined ? only : null };
}

/**
 * The collisions among a copy's marks: the marks that arrived together and lost to the same save's author, oldest
 * first. A reconnect's catch-up that set many files aside is one.
 */
export function collisions(marks: readonly ShownSetAside[]): ShownSetAside[][] {
	const groups = new Map<string, ShownSetAside[]>();
	for (const mark of [...marks].sort((a, b) => a.at - b.at)) {
		const key = `${mark.batch}\n${mark.self ? `self\n${mark.device ?? ""}` : `by\n${mark.by ?? ""}`}`;
		groups.set(key, [...(groups.get(key) ?? []), mark]);
	}
	return [...groups.values()];
}

/** What the agent is asked: every clashed file, where both sides are, and what to do with them. */
export function setAsideAsk(marks: readonly ShownSetAside[]): string {
	const lines = marks.map((mark) => {
		const file = `design/${mark.path}`;
		if (mark.self) {
			const other = mark.device === null ? "my other copy" : `my other copy on ${mark.device}`;
			if (mark.kind === "restored" || mark.deleted || mark.file === null)
				return `- ${file}: I deleted it here and ${other} edited it, so it stayed. Read that version and tell me whether it should still go; if it should, delete it again.`;
			return `- ${file}: the version from ${other} is in the file now. This copy's is in ${mark.file}.`;
		}
		const who = mark.by ?? "a teammate";
		if (mark.kind === "restored" || mark.deleted || mark.file === null)
			return `- ${file}: I deleted it and ${who} edited it, so it stayed. Read their version and tell me whether it should still go; if it should, delete it again.`;
		return `- ${file}: ${who}'s version is in the file now. Mine is in ${mark.file}.`;
	});
	const self = otherCopy(marks) !== null;
	return [
		self
			? "My changes to these files in this team project clashed with another copy of mine: both changed the same lines, and the other copy's reached the team first."
			: "My changes to these files in this team project clashed with a teammate's: we both changed the same lines, and theirs reached the team first.",
		"",
		...lines,
		"",
		self
			? "Redo each of this copy's changes on top of the version in the file, keeping the other copy's work."
			: "Redo each of my changes on top of the team's version in the file, keeping their work.",
	].join("\n");
}

/** A collision's one line: who, and what both changed. */
export function setAsideSays(marks: readonly ShownSetAside[]): string {
	const [first] = marks;
	const frames = new Set(marks.flatMap((mark) => mark.frames));
	let what: string;
	if (marks.length === 1 && first !== undefined)
		what = first.frames.length === 1 ? (first.frames[0] ?? first.path) : first.path;
	else if (frames.size > 0 && marks.every((mark) => mark.frames.length > 0))
		what = `${frames.size} ${frames.size === 1 ? "frame" : "frames"}`;
	else what = `${marks.length} files`;
	const self = otherCopy(marks);
	if (self !== null)
		return self.device === null
			? `Two of your copies both changed ${what}`
			: `This copy and your copy on ${self.device} both changed ${what}`;
	const names = new Set(marks.map((mark) => mark.by));
	const [only] = names;
	const who = names.size === 1 && only != null ? `You and ${only}` : "You and a teammate";
	return `${who} both changed ${what}`;
}

/** What Use theirs and Use mine say: whose the other side is, a teammate's or another copy of this account's. */
export function setAsideSides(marks: readonly ShownSetAside[]): { theirs: string; mine: string } {
	return otherCopy(marks) === null
		? { theirs: "Use theirs", mine: "Use mine" }
		: { theirs: "Use the other copy's", mine: "Use this copy's" };
}

export interface SetAsideFix {
	/** What the third action says: the agent fixes it, or, with no agent on this machine, its prompt is copied. */
	label: string;
	run(marks: readonly ShownSetAside[]): void;
}

/**
 * The project's collisions, read when the canvas opens, when sync says they changed (the `set-aside` change event,
 * passed on as `spool-set-aside-change`), and when the window comes back to the front. The count, or nothing.
 */
export function useSetAside(project: string, fix: SetAsideFix): ReactNode {
	const [marks, setMarks] = useState<ShownSetAside[]>([]);
	const revision = useRef(0);

	const refresh = useCallback(() => {
		const asked = ++revision.current;
		void fetchSetAside(project).then((next) => {
			if (asked === revision.current) setMarks(next);
		});
	}, [project]);

	useEffect(() => {
		refresh();
		window.addEventListener("spool-set-aside-change", refresh);
		window.addEventListener("focus", refresh);
		return () => {
			revision.current++;
			window.removeEventListener("spool-set-aside-change", refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);

	const groups = useMemo(() => collisions(marks), [marks]);
	if (marks.length === 0) return null;
	/** Answer every mark a collision stands for, at once. */
	const answer = (group: readonly ShownSetAside[], act: (project: string, id: string) => Promise<boolean>) => {
		const ids = new Set(group.map((mark) => mark.id));
		setMarks((current) => current.filter((mark) => !ids.has(mark.id)));
		void Promise.all(group.map((mark) => act(project, mark.id))).then(refresh);
	};
	return (
		<SetAsideCount
			count={marks.length}
			collisions={groups}
			fixLabel={fix.label}
			onTheirs={(group) => answer(group, dismissSetAside)}
			onMine={(group) => answer(group, putSetAsideBack)}
			onFix={(group) => fix.run(group)}
		/>
	);
}

/** px the list keeps from the left edge of what it opens over */
const EDGE_GUTTER = 12;

/**
 * `n set aside`, hung under who's here at the canvas's top right: quiet, and still when a mark arrives. Pressed, it
 * lists each collision on a line of its own, cut short before its actions rather than running under them.
 */
export function SetAsideCount({
	count,
	collisions: groups,
	fixLabel,
	onTheirs,
	onMine,
	onFix,
	defaultOpen = false,
}: {
	count: number;
	collisions: readonly (readonly ShownSetAside[])[];
	fixLabel: string;
	onTheirs: (group: readonly ShownSetAside[]) => void;
	onMine: (group: readonly ShownSetAside[]) => void;
	onFix: (group: readonly ShownSetAside[]) => void;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const root = useRef<HTMLDivElement | null>(null);
	const button = useRef<HTMLButtonElement | null>(null);
	// the list opens leftward from the count's right edge, as wide as the canvas and the window leave it
	const [room, setRoom] = useState<number | null>(null);
	useLayoutEffect(() => {
		if (!open) return;
		const measure = () => {
			const count = root.current;
			if (count === null) return;
			// what the list may not cross: the window, or a box round it that cuts what overflows it (the canvas)
			let edge = 0;
			for (let box = count.offsetParent; box instanceof HTMLElement; box = box.offsetParent)
				if (getComputedStyle(box).overflowX !== "visible") edge = Math.max(edge, box.getBoundingClientRect().left);
			const right = count.getBoundingClientRect().right;
			setRoom(right > 0 ? Math.max(0, right - edge - EDGE_GUTTER) : null);
		};
		measure();
		// the canvas the count stands on resizes with the window, and again as a pane folds or opens after it
		const sizes = new ResizeObserver(measure);
		for (let box = root.current?.offsetParent; box instanceof HTMLElement; box = box.offsetParent) sizes.observe(box);
		window.addEventListener("resize", measure);
		return () => {
			sizes.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [open]);
	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		const closeOnEsc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.stopImmediatePropagation();
			setOpen(false);
			if (root.current?.contains(document.activeElement)) button.current?.focus();
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", closeOnEsc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", closeOnEsc, true);
		};
	}, [open]);
	// the canvas under it never takes a press, a wheel or a menu meant for the count or its list
	useEffect(() => {
		const element = root.current;
		if (element === null) return;
		const keep = (event: Event) => event.stopPropagation();
		const kinds = ["pointerdown", "wheel", "contextmenu"] as const;
		for (const kind of kinds) element.addEventListener(kind, keep);
		return () => {
			for (const kind of kinds) element.removeEventListener(kind, keep);
		};
	}, []);
	return (
		<div ref={root} className="relative flex items-center" data-set-aside-count="">
			<Button
				ref={button}
				variant="ghost"
				size="sm"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => setOpen((was) => !was)}
			>
				<Count value={`${count} set aside`} />
			</Button>
			{open && (
				<Popover
					pad="sm"
					aria-label="Set aside"
					data-set-aside-list=""
					className="absolute top-full right-0 z-30 mt-1.5 w-[640px]"
					style={room === null ? undefined : { maxWidth: room }}
				>
					<ul className="flex flex-col">
						{groups.map((group) => {
							const says = setAsideSays(group);
							const sides = setAsideSides(group);
							return (
								<li
									key={group.map((mark) => mark.id).join("\n")}
									data-set-aside=""
									// short of room the actions go under the line rather than past the list's edge
									className="flex min-h-row flex-wrap items-center justify-end gap-x-3 pl-2"
								>
									<span className="min-w-0 grow basis-32 truncate text-primary type-control" title={says}>
										{says}
									</span>
									<span className="flex shrink-0 items-center">
										<TextAction onClick={() => onTheirs(group)}>{sides.theirs}</TextAction>
										<TextAction onClick={() => onMine(group)}>{sides.mine}</TextAction>
										<TextAction onClick={() => onFix(group)}>{fixLabel}</TextAction>
									</span>
								</li>
							);
						})}
					</ul>
				</Popover>
			)}
		</div>
	);
}
