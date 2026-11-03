import { useCallback, useEffect, useRef, useState } from "react";
import {
	cancelProjectTransfer,
	cloneRepo,
	type Finding,
	fetchCloneProgress,
	findOpenable,
	getTeamProjectAt,
	importProject,
	importProjectFrom,
	initProjectAt,
	openProjectAt,
} from "./api";
import { type Notice, Toast as NoticeToast } from "./canvas/toast";
import { type Answer, answerOf, isLink } from "./open-answer";
import { type Dropped, DropTarget, useOpenDrop } from "./open-drop";
import { OpenSheet, type SheetBody } from "./open-sheet";
import { tilde } from "./paths";
import { PlaceChooser } from "./place-chooser";

type Opened = { root: string; name: string };

/** Typing in a field, where ⌘V is the field's. */
const editing = (target: EventTarget | null) =>
	target instanceof HTMLInputElement ||
	target instanceof HTMLTextAreaElement ||
	(target instanceof HTMLElement && target.isContentEditable);

/**
 * Open…: existing work comes into spool the Mac's way. The chooser (the system's open panel in the Mac app), a drop on
 * the window and a paste on Home all hand over something, a path or a link, and one rule takes it: a folder that
 * already has designs (or a folder inside one) opens at once, a team's spool.page link comes down and opens, and only
 * when spool would make something does the sheet ask first, with one button. When nothing answers it says so plainly.
 *
 * `home` is whether Home is in front: it alone takes a paste, and a drop of anything but a .spool file.
 */
export function useOpen({ home, onOpened }: { home: boolean; onOpened: (project: Opened) => void }) {
	const [choosing, setChoosing] = useState(false);
	const [sheet, setSheet] = useState<SheetBody | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	/** what the sheet's button does, and how to stop it once it is under way */
	const pending = useRef<Extract<Answer, { kind: "ask" }> | null>(null);
	const work = useRef<AbortController | null>(null);
	/** each take outdates the last: an answer that comes back after another take, or a Cancel, is dropped */
	const turn = useRef(0);
	const opened = useRef(onOpened);
	opened.current = onOpened;

	useEffect(() => {
		if (notice === null) return;
		const timer = setTimeout(() => setNotice(null), 5000);
		return () => clearTimeout(timer);
	}, [notice]);
	useEffect(() => () => work.current?.abort(), []);

	const stop = useCallback(() => {
		turn.current++;
		work.current?.abort();
		work.current = null;
		pending.current = null;
	}, []);
	const finish = (project: Opened) => {
		stop();
		setSheet(null);
		opened.current(project);
	};
	const nothing = (given: string, says: string) => {
		pending.current = null;
		setSheet({ kind: "nothing", given, says });
	};
	/** run `act` as this turn's work; an error says itself in the sheet with what was given kept */
	const run = async <T,>(given: string, act: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
		const mine = turn.current;
		const controller = new AbortController();
		work.current = controller;
		try {
			const done = await act(controller.signal);
			return mine === turn.current ? done : undefined;
		} catch (error) {
			if (mine === turn.current && !controller.signal.aborted)
				nothing(given, error instanceof Error ? error.message : "Could not finish. Try again.");
			return undefined;
		}
	};

	const answer = async (given: string, finding: Finding) => {
		const found = answerOf(finding);
		if (found.kind === "nothing") return nothing(given, found.says);
		if (found.kind === "ask") {
			pending.current = found;
			return setSheet({ kind: "ask", ask: found.ask, work: null });
		}
		if (found.kind === "open") {
			const done = await run(given, async () => {
				const outcome = await openProjectAt(found.root);
				if (outcome.kind === "error") throw new Error(outcome.message);
				return outcome;
			});
			if (done !== undefined) finish(done);
			return;
		}
		// a team's project not on this Mac: it comes down first, into the checkout that waits for it if there is one
		setSheet({
			kind: "ask",
			ask: {
				face: "link",
				name: found.project,
				says: "spool gets it from spool.page and opens it.",
				detail: [
					`spool.page/${found.team}/${found.project}`,
					found.checkout === null ? "just on this Mac" : `into ${tilde(found.checkout)}`,
				],
				act: "Open",
			},
			work: { line: `getting ${found.project} from spool.page` },
		});
		const done = await run(given, (signal) =>
			getTeamProjectAt(
				found.team,
				found.project,
				found.checkout === null ? { where: "mac" } : { where: "checkout", path: found.checkout },
				signal,
			),
		);
		if (done !== undefined) finish(done);
	};

	/** The one rule, whatever brought it. */
	const take = async (given: string) => {
		stop();
		setChoosing(false);
		const mine = turn.current;
		if (isLink(given)) setSheet({ kind: "looking", given: given.trim() });
		const finding = await findOpenable(given);
		if (mine === turn.current) await answer(given, finding);
	};

	const act = async () => {
		const asked = pending.current;
		if (asked === null) return;
		const given = asked.finding.kind === "repo" ? asked.finding.url : asked.finding.path;
		const showing = (line: string, done?: number) =>
			setSheet({ kind: "ask", ask: asked.ask, work: { line, ...(done === undefined ? {} : { done }) } });
		if (asked.finding.kind === "folder") {
			const { path } = asked.finding;
			showing(`adding design/ to ${tilde(path)}`);
			const done = await run(given, async () => {
				const outcome = await initProjectAt(path);
				if (outcome.kind === "error") throw new Error(outcome.message);
				return outcome;
			});
			if (done !== undefined) finish(done);
		} else if (asked.finding.kind === "file") {
			const { path, into } = asked.finding;
			showing(`unpacking into ${tilde(into)}`);
			const done = await run(given, (signal) => importProjectFrom(path, signal));
			if (done !== undefined) finish(done);
		} else {
			const { url, into } = asked.finding;
			const transfer = crypto.randomUUID();
			showing(`cloning into ${tilde(into)}`, 0);
			const mine = turn.current;
			// git says how far only while it receives and resolves: between, the bar holds where it was
			let done = 0;
			const poll = setInterval(() => {
				void fetchCloneProgress(transfer).then((progress) => {
					if (progress === null || mine !== turn.current) return;
					done = progress.done ?? done;
					showing(progress.line, done);
				});
			}, 250);
			const cloned = await run(given, (signal) => cloneRepo(url, transfer, signal)).finally(() =>
				clearInterval(poll),
			);
			// read again: designs open, a plain clone asks to design in it
			if (cloned !== undefined) await answer(given, cloned);
		}
	};

	const cancel = () => {
		stop();
		setSheet(null);
	};

	/** A browser's drop of a .spool file: imported by its bytes, as there is no path to read. */
	const importBytes = async (file: File) => {
		stop();
		const transfer = crypto.randomUUID();
		setSheet({
			kind: "ask",
			ask: {
				face: "file",
				name: file.name,
				says: "spool keeps a copy of its frames with your projects.",
				detail: [file.name, "into your projects folder"],
				act: "Import",
			},
			work: { line: `unpacking ${file.name}` },
		});
		const done = await run(file.name, async (signal) => {
			signal.addEventListener("abort", () => void cancelProjectTransfer(transfer).catch(() => {}));
			return importProject(file, transfer);
		});
		if (done !== undefined) finish(done);
	};

	const drop = (dropped: Dropped) => {
		if (dropped.kind === "given") void take(dropped.given);
		else if (dropped.kind === "bytes") void importBytes(dropped.file);
		else setNotice({ kind: "error", message: dropped.says });
	};
	const held = useOpenDrop(home, drop);

	// ⌘V on Home, outside a field, takes what was copied: a path, a git link or a spool.page link
	const live = useRef({ home, take, idle: !choosing && sheet === null });
	live.current = { home, take, idle: !choosing && sheet === null };
	useEffect(() => {
		const paste = (event: ClipboardEvent) => {
			const now = live.current;
			if (!now.home || !now.idle || editing(event.target) || document.querySelector("dialog[open]") !== null) return;
			const text = event.clipboardData?.getData("text").trim() ?? "";
			if (text === "") return;
			event.preventDefault();
			void now.take(text);
		};
		window.addEventListener("paste", paste);
		return () => window.removeEventListener("paste", paste);
	}, []);

	const choose = useCallback(() => {
		stop();
		setSheet(null);
		setChoosing(true);
	}, [stop]);
	return {
		/** Open…: the chooser, which hands what was picked to the rule */
		choose,
		/** the chooser or the sheet is up, which keeps the keys from the canvas */
		up: choosing || sheet !== null,
		/** a path or a link from elsewhere, the Mac app's own Open With included */
		take: (given: string) => void take(given),
		surface: (
			<>
				{choosing && (
					<PlaceChooser
						purpose="open"
						start="~"
						onChoose={(path) => void take(path)}
						onCancel={() => setChoosing(false)}
					/>
				)}
				{sheet !== null && (
					<OpenSheet body={sheet} onAct={() => void act()} onCancel={cancel} onRetry={(text) => void take(text)} />
				)}
				{held && <DropTarget />}
				{notice !== null && (
					<div className="-translate-x-1/2 fixed bottom-20 left-1/2 z-50">
						<NoticeToast notice={notice} />
					</div>
				)}
			</>
		),
	};
}
