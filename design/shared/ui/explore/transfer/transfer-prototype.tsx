import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { MenuItem } from "shared/ui/spool/context-menu";
import { SpoolShell } from "shared/ui/spool/shell";

// Throwaway exploration: whole-project handoff versus deliberately adding frames.
// All transfers, sizes and progress are fixtures. No archive is read or written.
export type TransferTake = "window" | "edge" | "choice";
export type TransferState =
	| "idle"
	| "hover"
	| "export"
	| "packing"
	| "ready"
	| "loading"
	| "opened"
	| "duplicate"
	| "replace"
	| "pick"
	| "added"
	| "error"
	| "choose";
const FRAMES = ["menu", "cart", "receipt"] as const;
const BUTTON =
	"rounded-sm border border-border-raised px-3 py-2 type-control transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-thread disabled:opacity-40";

function Action({
	children,
	onClick,
	primary = false,
	disabled = false,
}: {
	children: ReactNode;
	onClick: () => void;
	primary?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(BUTTON, primary && "bg-text text-bg hover:bg-text/90")}
		>
			{children}
		</button>
	);
}

export function TransferPrototype({
	take = "window",
	initial = "idle",
}: {
	take?: TransferTake;
	initial?: TransferState;
}) {
	const [state, setState] = useState<TransferState>(initial);
	const [active, setActive] = useState(initial === "opened" ? "kaffe-studies" : "kaffe");
	const [tabs, setTabs] = useState(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
	const [hover, setHover] = useState(initial === "hover");
	const [menu, setMenu] = useState(false);
	const [slow, setSlow] = useState(true);
	const [same, setSame] = useState(false);
	const [scope, setScope] = useState("project");
	const [selected, setSelected] = useState<string[]>([...FRAMES]);
	const [added, setAdded] = useState(initial === "added");
	const [copy, setCopy] = useState(false);
	const [notice, setNotice] = useState("");
	const [stage, setStage] = useState("Reading file…");
	const [busyVisible, setBusyVisible] = useState(initial === "loading" || initial === "packing");
	const [fileName, setFileName] = useState(initial === "error" ? "kaffe.zip" : "kaffe-studies.spool");
	const input = useRef<HTMLInputElement>(null);
	const dragDepth = useRef(0);
	const busy = state === "loading" || state === "packing";
	const modal = ["export", "ready", "duplicate", "replace", "pick", "error", "choose"].includes(state);

	function openProject(name: string) {
		setTabs((current) => (current.includes(name) ? current : [...current, name]));
		setActive(name);
		setState("opened");
		setNotice("Project added to Home");
	}
	function receive(name = "kaffe-studies.spool") {
		setCopy(false);
		setNotice("");
		setFileName(name);
		setHover(false);
		dragDepth.current = 0;
		if (!name.endsWith(".spool")) {
			setState("error");
			return;
		}
		if (same) {
			setState("duplicate");
			return;
		}
		if (take === "choice") {
			setState("choose");
			return;
		}
		setState("loading");
	}
	function reset() {
		setState(initial);
		setHover(initial === "hover");
		setMenu(false);
		setNotice("");
		setAdded(initial === "added");
		setActive(initial === "opened" ? "kaffe-studies" : "kaffe");
		setTabs(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
		setSelected([...FRAMES]);
		setCopy(false);
		setFileName("kaffe-studies.spool");
	}
	useEffect(() => {
		if (!busy) {
			setBusyVisible(false);
			return;
		}
		setStage(state === "packing" ? "Gathering frames and assets…" : "Reading file…");
		const gate = window.setTimeout(() => setBusyVisible(true), 160);
		const phase = window.setTimeout(
			() => setStage(state === "packing" ? "Packing kaffe.spool…" : "Opening frames…"),
			1100,
		);
		const finish = window.setTimeout(
			() => {
				if (state === "packing") setState("ready");
				else {
					const name = copy ? "kaffe-copy" : same || initial === "replace" ? "kaffe" : "kaffe-studies";
					setTabs((current) => (current.includes(name) ? current : [...current, name]));
					setActive(name);
					setState("opened");
					setNotice("Project added to Home");
				}
			},
			slow ? 3000 : 90,
		);
		return () => {
			window.clearTimeout(gate);
			window.clearTimeout(phase);
			window.clearTimeout(finish);
		};
	}, [busy, state, slow, same, copy, initial]);
	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(""), 5000);
		return () => window.clearTimeout(timer);
	}, [notice]);
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setHover(false);
			setMenu(false);
			setState("idle");
			dragDepth.current = 0;
		};
		window.addEventListener("keydown", escape);
		return () => window.removeEventListener("keydown", escape);
	}, []);
	const pages: PageRow[] = [
		{ name: "app", frames: FRAMES, active: !added, open: true },
		{ name: "site", frames: ["landing", "pricing"] },
		{ name: "system", frames: ["type", "buttons", "colours"] },
		...(added ? [{ name: "from-kaffe-studies", frames: selected, active: true, open: true }] : []),
	];
	return (
		<div className="flex h-full flex-col bg-bg font-sans text-text">
			<div
				className="relative min-h-0 flex-1"
				onDragEnter={(event) => {
					event.preventDefault();
					dragDepth.current++;
					if (!busy) setHover(true);
				}}
				onDragOver={(event) => {
					event.preventDefault();
					event.dataTransfer.dropEffect = "copy";
				}}
				onDragLeave={() => {
					dragDepth.current--;
					if (dragDepth.current <= 0) setHover(false);
				}}
				onDrop={(event) => {
					event.preventDefault();
					if (!busy)
						receive(
							event.dataTransfer.files[0]?.name ??
								event.dataTransfer.getData("text/plain") ??
								"kaffe-studies.spool",
						);
				}}
			>
				<SpoolShell
					activeTab={active === "Home" ? undefined : active}
					tabs={tabs}
					zoom="38%"
					onFocus={setActive}
					onHome={() => setActive("Home")}
					onPick={() => setMenu(!menu)}
					onClose={(name) => {
						setTabs(tabs.filter((tab) => tab !== name));
						setActive("Home");
					}}
					headerAccessory={
						<button
							type="button"
							aria-label="Project actions"
							onClick={() => setMenu(!menu)}
							className="h-7 w-7 rounded-sm text-muted hover:bg-surface"
						>
							•••
						</button>
					}
				>
					{active === "Home" ? (
						<div className="h-full bg-canvas px-20 py-16">
							<h1 className="type-page">Projects</h1>
							<div className="mt-8 flex gap-5">
								{tabs.map((tab) => (
									<button
										type="button"
										key={tab}
										onClick={() => setActive(tab)}
										className="w-64 rounded-md border border-border-raised bg-surface p-6 text-left"
									>
										<div className="mb-12 flex gap-2">
											{FRAMES.map((name) => (
												<span
													key={name}
													className="h-20 w-10 rounded-xs border border-border-raised bg-raised"
												/>
											))}
										</div>
										<span className="type-title">{tab}</span>
										<p className="mt-2 text-muted type-detail">on this mac</p>
									</button>
								))}
							</div>
							<button type="button" onClick={() => input.current?.click()} className={cn(BUTTON, "mt-8")}>
								Import project…
							</button>
						</div>
					) : (
						<CanvasChrome pages={pages} rail={null}>
							<div className="flex h-full items-center justify-center gap-12 pb-12">
								{FRAMES.filter((name) => !added || selected.includes(name)).map((name) => (
									<div key={name} className={cn("relative", added && "animate-agent-entry")}>
										<p className="mb-3 text-muted type-value">{added ? `${name}-study` : name}</p>
										<div className="relative h-[346px] w-[160px]">
											<div className="h-[520px] w-[240px] origin-top-left scale-[0.6667]">
												<CoffeeScreen screen={name} />
											</div>
										</div>
										{added ? (
											<span className="absolute -left-3 top-1 h-1.5 w-1.5 rounded-full bg-thread" />
										) : null}
									</div>
								))}
							</div>
						</CanvasChrome>
					)}
				</SpoolShell>
				<input
					ref={input}
					aria-label="Choose a spool project"
					type="file"
					accept=".spool"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) receive(file.name);
						event.target.value = "";
					}}
				/>
				{menu ? (
					<div
						role="menu"
						className="absolute right-4 top-12 z-30 flex w-60 flex-col rounded-md border border-border-raised bg-raised p-1 animate-menu-in"
					>
						<MenuItem
							label="Export project…"
							onClick={() => {
								setMenu(false);
								setState("export");
							}}
						/>
						<MenuItem
							label="Import project…"
							onClick={() => {
								setMenu(false);
								input.current?.click();
							}}
						/>
						<div className="my-1 border-border-raised border-t" />
						<MenuItem
							label="Add frames from a file…"
							onClick={() => {
								setMenu(false);
								setState("pick");
							}}
						/>
					</div>
				) : null}
				{hover && !busy ? (
					<div
						className={cn(
							"pointer-events-none absolute inset-2 z-40 rounded-md border border-thread animate-boot-in",
							take !== "edge" && "bg-bg/75",
						)}
					>
						<div
							className={cn(
								"absolute left-1/2 -translate-x-1/2",
								take === "edge"
									? "bottom-12 rounded-md border border-border-raised bg-raised px-8 py-5"
									: "top-1/2 -translate-y-1/2 text-center",
							)}
						>
							<p className="type-heading">{take === "choice" ? "Drop to import" : "Drop to open a project"}</p>
							<p className="mt-2 text-muted type-control">
								{take === "choice"
									? "Open separately or add frames to kaffe."
									: "It opens in a new tab and appears in Home."}
							</p>
							<p className="mt-5 type-value">{fileName}</p>
						</div>
					</div>
				) : null}
				{busyVisible && busy ? (
					<div
						role="status"
						className="absolute bottom-20 left-1/2 z-40 w-[360px] -translate-x-1/2 overflow-hidden rounded-md border border-border-raised bg-raised animate-toast-in"
					>
						<div className="flex items-center justify-between px-4 py-3">
							<div>
								<p className="type-control">{stage}</p>
								<p className="mt-1 text-muted type-detail">{state === "packing" ? "kaffe.spool" : fileName}</p>
							</div>
							<button
								type="button"
								className="text-muted type-control hover:text-text"
								onClick={() => setState("idle")}
							>
								Cancel
							</button>
						</div>
						<div className="h-px bg-border-raised">
							<div className="h-px w-1/3 bg-thread animate-toast-sweep" />
						</div>
					</div>
				) : null}
				{notice ? (
					<div
						role="status"
						className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-6 rounded-md border border-border-raised bg-raised px-4 py-3 animate-toast-in type-control"
					>
						{notice}
						{added ? (
							<button
								type="button"
								className="text-muted hover:text-text"
								onClick={() => {
									setAdded(false);
									setState("idle");
									setNotice("");
								}}
							>
								Undo
							</button>
						) : null}
					</div>
				) : null}
				{modal ? (
					<div className="absolute inset-0 z-40 flex items-center justify-center bg-bg/55 animate-find-in">
						<section
							role="dialog"
							aria-modal="true"
							aria-labelledby="transfer-title"
							className="w-[460px] rounded-lg border border-border-raised bg-surface animate-find-panel-in"
						>
							<div className="flex items-center justify-between border-border border-b px-6 py-4">
								<h2 id="transfer-title" className="type-heading">
									{state === "export"
										? "Export kaffe"
										: state === "ready"
											? "Your project is ready"
											: state === "duplicate"
												? "kaffe is already on this Mac"
												: state === "replace"
													? "Replace kaffe?"
													: state === "pick"
														? "Add frames to kaffe"
														: state === "choose"
															? "Open kaffe-studies"
															: "This file could not be opened"}
								</h2>
								<button
									type="button"
									aria-label="Close"
									className="ml-4 text-muted hover:text-text"
									onClick={() => setState("idle")}
								>
									✕
								</button>
							</div>
							<div className="px-6 py-5">
								{state === "export" ? (
									<>
										<p className="mb-5 text-muted type-body">Send an editable copy to someone using spool.</p>
										<div className="space-y-2">
											{[
												["project", "Entire project", "3 pages · 8 frames"],
												["page", "Current page", "app · 3 frames"],
											].map(([value, label, detail]) => (
												<label
													key={value}
													className={cn(
														"flex cursor-pointer items-center gap-3 rounded-sm border p-3",
														scope === value ? "border-muted" : "border-border",
													)}
												>
													<input
														type="radio"
														name="scope"
														checked={scope === value}
														onChange={() => setScope(value ?? "project")}
														className="accent-thread"
													/>
													<span className="flex-1 type-control">{label}</span>
													<span className="text-muted type-detail">{detail}</span>
												</label>
											))}
										</div>
										<p className="mt-5 text-muted type-control">
											Frames, layout, flows and local assets travel together.
										</p>
									</>
								) : null}
								{state === "ready" ? (
									<>
										<p className="type-value">{scope === "project" ? "kaffe.spool" : "kaffe-app.spool"}</p>
										<p className="mt-2 text-muted type-detail">
											{scope === "project" ? "8 frames · 3 pages" : "3 frames · 1 page"} · 2.4 mb
										</p>
										<p className="mt-5 text-muted type-body">
											Send the file in Slack. They can drop it anywhere in spool to open it.
										</p>
									</>
								) : null}
								{state === "duplicate" ? (
									<>
										<p className="text-muted type-body">
											Open the copy already here, or keep this file as a separate project.
										</p>
										<div className="mt-5 flex flex-col gap-2">
											<Action primary onClick={() => openProject("kaffe")}>
												Open existing project
											</Action>
											<Action
												onClick={() => {
													setCopy(true);
													setState("loading");
												}}
											>
												Import as a copy
											</Action>
											<button
												type="button"
												className="mt-3 text-muted type-control hover:text-text"
												onClick={() => setState("replace")}
											>
												Replace existing project…
											</button>
										</div>
									</>
								) : null}
								{state === "replace" ? (
									<>
										<p className="text-muted type-body">
											The imported file takes the place of all 8 frames in this project. Your current project
											will be kept as kaffe-backup.
										</p>
										<p className="mt-5 type-value">kaffe.spool → kaffe</p>
									</>
								) : null}
								{state === "choose" ? (
									<>
										<p className="text-muted type-body">3 frames from kaffe-studies.spool</p>
										<div className="mt-5 flex flex-col gap-2">
											<Action primary onClick={() => setState("loading")}>
												Open as a new project
											</Action>
											<Action onClick={() => setState("pick")}>Add frames to kaffe…</Action>
										</div>
									</>
								) : null}
								{state === "pick" ? (
									<>
										<p className="mb-4 text-muted type-control">From kaffe-studies.spool</p>
										{FRAMES.map((name) => (
											<label
												key={name}
												className="flex cursor-pointer items-center gap-3 border-border border-b py-3"
											>
												<input
													type="checkbox"
													checked={selected.includes(name)}
													onChange={() =>
														setSelected(
															selected.includes(name)
																? selected.filter((item) => item !== name)
																: [...selected, name],
														)
													}
													className="accent-thread"
												/>
												<span className="flex-1 type-value">{name}</span>
												<span className="text-muted type-caption">Keep both</span>
											</label>
										))}
										<p className="mt-5 text-muted type-control">
											Added on a new page, from-kaffe-studies. Matching names get a suffix. Linked frames and
											shared assets come with them.
										</p>
									</>
								) : null}
								{state === "error" ? (
									<>
										<p className="break-all type-value">{fileName}</p>
										<p className="mt-4 text-muted type-body">Choose a .spool file exported from a project.</p>
									</>
								) : null}
							</div>
							{state !== "duplicate" && state !== "choose" ? (
								<div className="flex justify-end gap-2 border-border border-t px-6 py-4">
									<Action onClick={() => setState("idle")}>Cancel</Action>
									{state === "export" ? (
										<Action primary onClick={() => setState("packing")}>
											Export file
										</Action>
									) : state === "ready" ? (
										<Action
											primary
											onClick={() => {
												setState("idle");
												setNotice("File saved");
											}}
										>
											Save file
										</Action>
									) : state === "replace" ? (
										<Action
											primary
											onClick={() => {
												setTabs((current) => [...current, "kaffe-backup"]);
												setSame(true);
												setState("loading");
											}}
										>
											Back up and replace
										</Action>
									) : state === "pick" ? (
										<Action
											primary
											disabled={selected.length === 0}
											onClick={() => {
												setAdded(true);
												setActive("kaffe");
												setState("added");
												setNotice(`${selected.length} frames added to kaffe`);
											}}
										>
											Add {selected.length} frames
										</Action>
									) : (
										<Action
											primary
											onClick={() => {
												setState("idle");
												input.current?.click();
											}}
										>
											Choose file…
										</Action>
									)}
								</div>
							) : null}
						</section>
					</div>
				) : null}
			</div>
			<footer className="flex h-14 shrink-0 items-center gap-5 border-border-raised border-t bg-bg px-5 type-caption text-muted">
				<span>Prototype · file operations are simulated</span>
				<button
					type="button"
					draggable
					onDragStart={(event) => event.dataTransfer.setData("text/plain", "kaffe-studies.spool")}
					onClick={() => receive()}
					className="rounded-xs border border-border-raised px-3 py-1.5 text-text"
				>
					kaffe-studies.spool ↗
				</button>
				<span>Drag the file above, or click it.</span>
				<label className="ml-auto flex items-center gap-2">
					<input type="checkbox" checked={slow} onChange={(event) => setSlow(event.target.checked)} />
					Slow transfer
				</label>
				<label className="flex items-center gap-2">
					<input type="checkbox" checked={same} onChange={(event) => setSame(event.target.checked)} />
					Already imported
				</label>
				<button type="button" onClick={reset} className="text-text">
					Replay
				</button>
			</footer>
		</div>
	);
}
