import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { MenuItem } from "shared/ui/spool/context-menu";
import { Home } from "./current-home";
import { homeProjects } from "shared/ui/spool/home-fixture";
import { ProjectPicker, type ProjectPickerMode } from "shared/ui/spool/project-picker";
import { CloseIcon } from "./current-icons";
import { Toast } from "shared/ui/spool/toast";
import { FormatOption } from "./format-option";
import { SpoolShell } from "shared/ui/spool/shell";

// Throwaway exploration: whole-project handoff versus deliberately adding frames.
// All transfers, sizes and progress are fixtures. No archive is read or written.
export type TransferTake = "window" | "edge" | "choice";
export type TransferState =
	| "home"
	| "home-menu"
	| "tab-menu"
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
// The shipped Home / confirmation-dialog button classes.
const BUTTON = "home-action disabled:opacity-40";

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
			className={cn(BUTTON, primary && "home-action-primary")}
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
	const [active, setActive] = useState(
		initial === "home" || initial === "home-menu" ? "Home" : initial === "opened" ? "kaffe-studies" : "kaffe",
	);
	const [tabs, setTabs] = useState(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
	const [registered, setRegistered] = useState(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
	const [hover, setHover] = useState(initial === "hover");
	const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(
		initial === "tab-menu" ? { name: "kaffe", x: 160, y: 40 } : null,
	);
	const [picker, setPicker] = useState<ProjectPickerMode | null>(null);
	const [exportName, setExportName] = useState("kaffe");
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
		setRegistered((current) => current.includes(name) ? current : [...current, name]);
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
		setMenu(null);
		setNotice("");
		setAdded(initial === "added");
		setActive(
			initial === "home" || initial === "home-menu" ? "Home" : initial === "opened" ? "kaffe-studies" : "kaffe",
		);
		setTabs(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
		setRegistered(initial === "opened" ? ["kaffe", "kaffe-studies"] : ["kaffe"]);
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
			() => setStage(state === "packing" ? `Packing ${exportName}.spool…` : "Opening frames…"),
			1100,
		);
		const finish = window.setTimeout(
			() => {
				if (state === "packing") setState("ready");
				else {
					const name = copy ? "kaffe-copy" : same || initial === "replace" ? "kaffe" : "kaffe-studies";
					setRegistered((current) => current.includes(name) ? current : [...current, name]);
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
	}, [busy, state, slow, same, copy, initial, exportName]);
	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => setNotice(""), 5000);
		return () => window.clearTimeout(timer);
	}, [notice]);
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setHover(false);
			setMenu(null);
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
		...(added
			? [{ name: "from-kaffe-studies", frames: selected.map((name) => `${name}-study`), active: true, open: true }]
			: []),
	];
	return (
		<div className="flex h-full flex-col bg-bg font-sans text-text">
			<div
				className="relative min-h-0 flex-1"
				onContextMenu={(event) => {
					const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tab]") : null;
					const name = target?.dataset.tab;
					if (!name) return;
					event.preventDefault();
					const bounds = event.currentTarget.getBoundingClientRect();
					setMenu({
						name,
						x: Math.min(event.clientX - bounds.left, bounds.width - 204),
						y: event.clientY - bounds.top,
					});
				}}
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
					onPick={() => setPicker("start")}
					canvasControls={active !== "Home"}
					onClose={(name) => {
						setTabs(tabs.filter((tab) => tab !== name));
						setActive("Home");
					}}
				>
					{active === "Home" ? (
						<Home
							projects={registered.map((name, index) => ({
								root: name,
								name,
								openedAt: new Date(Date.now() - index * 86400000).toISOString(),
								frameCount: 8,
								covers: homeProjects.find((project) => project.name === "kaffe")?.covers ?? [],
							}))}
							initialMenu={initial === "home-menu" ? "kaffe" : null}
							onOpenProject={(project) => {setTabs((current) => current.includes(project.name) ? current : [...current, project.name]); setActive(project.name);}}
							onExportProject={(project) => {
								setExportName(project.name);
								setScope("project");
								setState("export");
							}}
							onForgetProject={() => setNotice("Hide from Spool is outside this prototype")}
							onTrashProject={() => setNotice("Move to Trash is outside this prototype")}
							onRenameProject={() => setNotice("Rename is outside this prototype")}
							onCopyPath={() => setNotice("Path copied · simulated")}
							onSettings={() => setNotice("Settings is outside this prototype")}
							onStart={() => setPicker("start")}
							onFolder={() => setPicker("folder")}
							onImport={() => input.current?.click()}
						/>
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
				{picker ? (
					<ProjectPicker
						initial={picker}
						onClose={() => setPicker(null)}
						onOpened={(project) => {
							setPicker(null);
							openProject(project.name);
						}}
					/>
				) : null}
				{menu ? (
					<>
						<button
							type="button"
							aria-label="Dismiss tab menu"
							className="absolute inset-0 z-20 cursor-default"
							onClick={() => setMenu(null)}
						/>
						<div
							role="menu"
							aria-label={`${menu.name} project`}
							style={{ left: menu.x, top: menu.y }}
							className="absolute z-30 flex w-[196px] animate-menu-in origin-top-left flex-col rounded-md border border-border-raised bg-raised p-unit"
						>
							<MenuItem
								label="Export project…"
								onClick={() => {
									setExportName(menu.name);
									setScope("project");
									setMenu(null);
									setState("export");
								}}
							/>
							<MenuItem
								label="Add frames from a file…"
								onClick={() => {
									setActive(menu.name);
									setMenu(null);
									setState("pick");
								}}
							/>
							<div className="mx-2 my-unit h-px bg-border-raised" />
							<MenuItem
								label="Close tab"
								onClick={() => {
									setTabs(tabs.filter((tab) => tab !== menu.name));
									if (active === menu.name) setActive("Home");
									setMenu(null);
								}}
							/>
						</div>
					</>
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
								<p className="mt-1 text-muted type-detail">
									{state === "packing" ? `${exportName}.spool` : fileName}
								</p>
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
				{notice && !added ? (
					<Toast notice={{ kind: "success", message: notice }} />
				) : notice ? (
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
							className="w-[380px] rounded-lg border border-border-raised bg-raised animate-menu-in"
						>
							<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
								<h2 id="transfer-title" className="type-title">
									{state === "export"
										? `Export ${exportName}`
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
									<CloseIcon />
								</button>
							</div>
							<div className="px-5 py-4">
								{state === "export" ? (
									<>
										<p className="mb-5 text-muted type-body">Send an editable copy to someone using spool.</p>
										<FormatOption
											checked
											description="3 pages · 8 frames"
											disabled={false}
											label="Entire project"
											onClick={() => setScope("project")}
										/>
										<p className="mt-5 text-muted type-control">
											Frames, layout, flows and local assets travel together.
										</p>
									</>
								) : null}
								{state === "ready" ? (
									<>
										<p className="type-value">{`${exportName}.spool`}</p>
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
								<div className="flex justify-end gap-2 border-border-raised border-t px-4 py-3">
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
								setRegistered((current) => [...current, "kaffe-backup"]);
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
				<span>Prototype · simulated files</span>
				<button
					type="button"
					draggable
					onDragStart={(event) => event.dataTransfer.setData("text/plain", "kaffe-studies.spool")}
					onClick={() => receive()}
					className="rounded-xs border border-border-raised px-3 py-1.5 text-text"
				>
					kaffe-studies.spool ↗
				</button>
				<span>Right-click a tab to export.</span>
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
