import { useEffect, useRef, useState } from "react";
import { AGENT_PRIMARY } from "./agent-dialog";
import { EmptyState } from "./empty-state";
import { ArrowRightIcon, RibbonMark } from "./icons";
import "./project-empty.css";

/** The empty project's name belongs to its folder; only a successful rename changes it. */
export function ProjectEmpty({
	project,
	root,
	onRename,
	onFolder,
	onUseAgent,
	focusName = false,
	onNameFocused,
}: {
	project: string;
	focusName?: boolean | undefined;
	onNameFocused?: (() => void) | undefined;
	root?: string | undefined;
	onRename?: ((name: string) => Promise<string | null>) | undefined;
	onFolder?: (() => void) | undefined;
	onUseAgent?: (() => void) | undefined;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!focusName) return;
		inputRef.current?.focus();
		inputRef.current?.select();
		onNameFocused?.();
	}, [focusName, onNameFocused]);
	const [draft, setDraft] = useState(project);
	const [renaming, setRenaming] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const saving = useRef(false);
	const cancelled = useRef(false);
	const rename = async (value: string) => {
		if (cancelled.current) {
			cancelled.current = false;
			return;
		}
		const name = value.trim();
		if (saving.current || onRename === undefined) return;
		if (name === "" || name === project) {
			setDraft(project);
			return;
		}
		saving.current = true;
		setRenaming(true);
		setNotice(null);
		try {
			const renamed = await onRename(name);
			setDraft(renamed ?? project);
			setCopied(false);
		} catch (error) {
			setDraft(project);
			setNotice(error instanceof Error ? error.message : "Could not rename the project. Try again.");
		} finally {
			saving.current = false;
			setRenaming(false);
		}
	};
	return (
		<EmptyState
			className="project-empty"
			heading="h1"
			icon={<RibbonMark />}
			title="Your canvas is ready."
			description="Open this project in your agent. Edits appear here as you work."
			actions={
				root === undefined ? undefined : (
					<>
						{onUseAgent && (
							<button
								type="button"
								disabled={renaming}
								className={`${AGENT_PRIMARY} pointer-events-auto mb-3`}
								onPointerDown={(event) => event.stopPropagation()}
								onClick={onUseAgent}
							>
								Use my agent <ArrowRightIcon className="h-4 w-4 shrink-0" />
							</button>
						)}
						<code onPointerDown={(event) => event.stopPropagation()}>{root}</code>
						<button
							type="button"
							disabled={renaming}
							className="project-empty-copy"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => {
								void Promise.resolve()
									.then(() => navigator.clipboard.writeText(root))
									.then(() => {
										setCopied(true);
										setCopyFailed(false);
									})
									.catch(() => setCopyFailed(true));
							}}
						>
							{copied ? "Copied" : "Copy project path"}
						</button>
						{copyFailed && (
							<span role="alert" className="text-muted type-label">
								Could not copy. Select the path and copy it manually.
							</span>
						)}
					</>
				)
			}
		>
			<div className="project-empty-title">
				<input
					ref={inputRef}
					aria-label="Rename project"
					value={draft}
					readOnly={renaming || onRename === undefined}
					aria-busy={renaming}
					aria-invalid={notice !== null}
					aria-describedby={notice ? "project-rename-notice" : undefined}
					spellCheck={false}
					onPointerDown={(event) => event.stopPropagation()}
					onChange={(event) => {
						setDraft(event.target.value);
						setNotice(null);
					}}
					onBlur={(event) => void rename(event.currentTarget.value)}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							cancelled.current = true;
							setDraft(project);
							setNotice(null);
							event.currentTarget.blur();
						}
					}}
				/>
				<span>{renaming ? "renaming…" : "saved on this mac"}</span>
				{notice && (
					<p id="project-rename-notice" role="alert">
						{notice}
					</p>
				)}
			</div>
			{onFolder && (
				<button
					type="button"
					className="project-empty-folder"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onFolder}
				>
					Open an existing project folder
				</button>
			)}
		</EmptyState>
	);
}
