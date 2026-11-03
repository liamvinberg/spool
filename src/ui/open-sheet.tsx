import { type ComponentType, useEffect, useLayoutEffect, useRef, useState } from "react";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { FolderIcon, LinkIcon, SpoolFileIcon } from "./icons";
import { Button } from "./primitives/actions";
import { SpinRing } from "./primitives/display";
import { Progress } from "./primitives/feedback";
import { TextField } from "./primitives/inputs";
import { Dialog, DialogFooter } from "./primitives/overlays";

/** What spool would make, asked first: the thing, one sentence, its facts in mono, and the one act. */
export interface Ask {
	face: "folder" | "file" | "link";
	name: string;
	says: string;
	/** where it is, then what the act does with it */
	detail: readonly [string, string];
	act: string;
}

/** The act under way: how far, when the work can say (0 to 1), and the line it prints meanwhile. */
export interface Work {
	done?: number | undefined;
	line: string;
}

export type SheetBody =
	| { kind: "looking"; given: string }
	| { kind: "ask"; ask: Ask; work: Work | null }
	| { kind: "nothing"; given: string; says: string };

const FACES: Record<Ask["face"], ComponentType<{ className?: string }>> = {
	folder: FolderIcon,
	file: SpoolFileIcon,
	link: LinkIcon,
};

/**
 * Open…'s one small sheet, hung from the window bar the way a Mac sheet hangs from its title bar. It comes up only
 * when spool would make something, or to say plainly that nothing answers, keeping what was given to fix and try again.
 * ⏎ is its one button and Esc is Cancel; Cancel during the work stops it.
 */
export function OpenSheet({
	body,
	onAct,
	onCancel,
	onRetry,
}: {
	body: SheetBody;
	onAct: () => void;
	onCancel: () => void;
	onRetry: (given: string) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const given = body.kind === "nothing" ? body.given : null;
	const [text, setText] = useState(given ?? "");
	useEffect(() => {
		if (given !== null) setText(given);
	}, [given]);
	useLayoutEffect(() => {
		const modal = dialog.current;
		const previous = document.activeElement;
		modal?.showModal();
		return () => {
			modal?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	const working = body.kind === "ask" && body.work !== null;
	useLayoutEffect(() => {
		if (body.kind === "ask" && body.work === null)
			dialog.current?.querySelector<HTMLButtonElement>("[data-act]")?.focus();
	}, [body]);
	const label = body.kind === "ask" ? body.ask.name : "Open";
	return (
		<Dialog
			native
			ref={dialog}
			width="free"
			aria-label={label}
			className="relative mt-0 mb-auto w-[480px] animate-sheet-down overflow-hidden rounded-t-none border-t-0 backdrop:animate-find-in"
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
			onKeyDown={(event) => event.stopPropagation()}
		>
			{working ? <Progress value={body.work?.done} label="Progress" className="top-0 bottom-auto" /> : null}
			<div key={body.kind === "ask" ? `ask:${body.ask.name}` : body.kind} className="animate-place-in">
				{body.kind === "looking" ? (
					<div className="flex items-center gap-4">
						<span className="grid size-12 shrink-0 place-items-center text-secondary">
							<LinkIcon className="size-7" />
						</span>
						<div className="min-w-0">
							<p className="flex items-center gap-2 text-primary type-title">
								<SpinRing className="size-3.5 text-secondary" />
								Looking up the link…
							</p>
							<p className="mt-1 truncate text-tertiary type-detail">{body.given}</p>
						</div>
					</div>
				) : body.kind === "nothing" ? (
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (text.trim() !== "") onRetry(text.trim());
						}}
					>
						<p role="alert" className="text-primary type-title">
							{body.says}
						</p>
						<TextField
							size="lg"
							mono
							error
							label="What was given"
							value={text}
							onValueChange={setText}
							inputProps={{ autoFocus: true }}
						/>
						<button type="submit" hidden />
					</form>
				) : (
					<AskBody ask={body.ask} work={body.work} />
				)}
			</div>
			<DialogFooter className="pt-5">
				<Button size="lg" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				{body.kind === "nothing" ? (
					<Button size="lg" variant="primary" disabled={text.trim() === ""} onClick={() => onRetry(text.trim())}>
						Try again
					</Button>
				) : (
					<Button
						size="lg"
						variant="primary"
						data-act=""
						disabled={body.kind === "looking"}
						loading={working}
						onClick={() => {
							if (!working) onAct();
						}}
					>
						{body.kind === "ask" ? body.ask.act : "Open"}
					</Button>
				)}
			</DialogFooter>
		</Dialog>
	);
}

function AskBody({ ask, work }: { ask: Ask; work: Work | null }) {
	const Face = FACES[ask.face];
	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-4">
				<span className="grid size-12 shrink-0 place-items-center text-secondary">
					<Face className="size-10" />
				</span>
				<div className="min-w-0">
					<h2 className="truncate text-primary type-heading">{ask.name}</h2>
					<p className="mt-0.5 text-secondary type-control">{ask.says}</p>
				</div>
			</div>
			<div className="mt-4 flex flex-col gap-0.5 text-tertiary type-detail [overflow-wrap:anywhere]">
				<span>{ask.detail[0]}</span>
				<span
					key={work === null ? "rest" : "work"}
					className={work === null ? undefined : "animate-chrome-in text-secondary"}
				>
					{work === null ? ask.detail[1] : work.line}
				</span>
			</div>
		</div>
	);
}
