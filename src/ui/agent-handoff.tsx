import { useEffect, useRef, useState } from "react";
import { AppLogo } from "./agent-app-logo";
import { AgentDialog } from "./agent-dialog";
import { fetchAgentAppAvailable, openAgentApp } from "./api";
import { cn } from "./cn";
import { FolderIcon } from "./icons";
import { Button } from "./primitives/actions";

// Setup paths checked against the vendors' desktop quickstarts on 2026-09-13.
const APPS = [
	{ id: "claude", name: "Claude", detail: "Code tab" },
	{ id: "chatgpt", name: "ChatGPT", detail: "Desktop" },
	{ id: "antigravity", name: "Antigravity", detail: "Gemini" },
] as const;
type AgentApp = (typeof APPS)[number]["id"];
const START_PROMPT =
	"Use spool to design in this project's existing design/ folder. Read the project instructions and design/AGENTS.md, then run the project's spool skill command.";

/** POSIX quoting: a copied folder name must never become a shell expression. */
export const agentAppCommand = (root: string) => `codex app '${root.replaceAll("'", "'\\''")}'`;

function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
	const [result, setResult] = useState<{ text: string; kind: "copied" | "failed" }>();
	const state = result?.text === text ? result.kind : "idle";
	return (
		<span className="inline-flex flex-col items-start gap-2">
			<Button
				size="lg"
				variant={primary ? "primary" : "secondary"}
				onClick={() => {
					void (async () => {
						try {
							await navigator.clipboard.writeText(text);
							setResult({ text, kind: "copied" });
						} catch {
							setResult({ text, kind: "failed" });
						}
					})();
				}}
			>
				{state === "copied" ? "Copied" : label}
			</Button>
			{state === "failed" && (
				<span role="alert" className="text-secondary type-label">
					Could not copy. Select the text and copy it manually.
				</span>
			)}
		</span>
	);
}

export function AgentHandoff({ project, root, onClose }: { project: string; root: string; onClose: () => void }) {
	const [app, setApp] = useState<AgentApp>("claude");
	const [available, setAvailable] = useState(false);
	useEffect(() => {
		let live = true;
		void fetchAgentAppAvailable(project).then((value) => {
			if (live) setAvailable(value);
		});
		return () => {
			live = false;
		};
	}, [project]);
	const [notice, setNotice] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const busy = useRef(false);
	const info = APPS.find((item) => item.id === app);
	return (
		<AgentDialog title="agent picker" wide onClose={onClose}>
			{(id) => (
				<>
					<header className="border-line-strong border-b px-7 py-6">
						<h2
							id={id}
							className="pr-5 font-medium text-[23px] leading-[30px] tracking-tight [overflow-wrap:anywhere]"
						>
							Open {project} in your agent
						</h2>
						<p className="mt-2 text-secondary type-body">Edits appear on this canvas.</p>
					</header>
					<div className="flex min-h-[312px] max-[540px]:flex-col">
						<nav
							aria-label="Agent apps"
							className="w-[194px] shrink-0 border-line-strong border-r p-3 max-[540px]:flex max-[540px]:w-full max-[540px]:border-r-0 max-[540px]:border-b"
						>
							{APPS.map((item) => (
								<button
									key={item.id}
									type="button"
									aria-current={app === item.id ? "page" : undefined}
									onClick={() => {
										setApp(item.id);
										setNotice(null);
									}}
									className={cn(
										"mb-1 flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left hover:bg-surface-raised max-[540px]:flex-col max-[540px]:gap-1 max-[540px]:px-1 max-[540px]:text-center",
										app === item.id ? "bg-surface-raised text-primary" : "text-secondary",
									)}
								>
									<AppLogo app={item.id} />
									<span>
										<span className="block type-control">{item.name}</span>
										<span className="mt-0.5 block text-secondary type-caption">{item.detail}</span>
									</span>
								</button>
							))}
						</nav>
						<div key={app} className="min-w-0 flex-1 px-7 py-6">
							<h3 className="type-heading">Open in {info?.name}</h3>
							<div className="mt-4 flex items-center gap-2.5 rounded-sm border border-line-strong px-3 py-3">
								<FolderIcon className="h-4 w-4 shrink-0 text-secondary" />
								<code className="select-text text-secondary type-detail [overflow-wrap:anywhere]">{root}</code>
							</div>
							<div className="mt-4 flex flex-wrap items-start gap-3">
								{app === "chatgpt" && available && (
									<Button
										size="lg"
										variant="primary"
										disabled={opening}
										onClick={() => {
											if (busy.current) return;
											busy.current = true;
											setOpening(true);
											setNotice(null);
											void openAgentApp(project)
												.then(() => setNotice("Project opened in ChatGPT."))
												.catch(() =>
													setNotice(
														"Could not open ChatGPT. Copy the project path and open the folder in the app.",
													),
												)
												.finally(() => {
													busy.current = false;
													setOpening(false);
												});
										}}
									>
										{opening ? "Opening…" : "Open project"} <span aria-hidden="true">↗</span>
									</Button>
								)}
								<CopyButton primary={app !== "chatgpt" || !available} text={root} label="Copy project path" />
							</div>
							{app === "chatgpt" && notice && (
								<p role="status" className="mt-3 text-secondary type-label">
									{notice}
								</p>
							)}
							<details className="mt-6 border-line-strong border-t pt-4 text-secondary type-label">
								<summary className="cursor-pointer hover:text-primary">Setup details</summary>
								<div className="space-y-4 pt-4">
									{app === "claude" && (
										<p>
											In Claude: <span className="text-primary">Code → Local → Select folder.</span> Use this
											folder so edits reach the canvas.
										</p>
									)}
									{app === "antigravity" && (
										<p>
											In Antigravity: <span className="text-primary">New Project → Add Folder.</span> Choose
											this folder, then start in Local Mode.
										</p>
									)}
									{app === "chatgpt" && (
										<>
											<p>
												Open this folder locally. On macOS, you can also launch it from Terminal with the
												Codex CLI:
											</p>
											<code className="block select-text text-primary type-detail [overflow-wrap:anywhere]">
												{agentAppCommand(root)}
											</code>
											<CopyButton text={agentAppCommand(root)} label="Copy command" />
										</>
									)}
									<p className="select-text">{START_PROMPT}</p>
									<CopyButton text={START_PROMPT} label="Copy starter prompt" />
								</div>
							</details>
						</div>
					</div>
					<footer className="flex justify-end border-line-strong border-t px-7 py-4">
						<Button variant="ghost" onClick={onClose}>
							Back to canvas
						</Button>
					</footer>
				</>
			)}
		</AgentDialog>
	);
}
