import { useEffect, useRef, useState } from "react";
import { AGENT_PRIMARY } from "./agent-dialog";
import { ArrowRightIcon, RibbonMark } from "./icons";
import { EmptyState } from "./primitives/feedback";

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
		<div className="project-empty relative h-full w-full">
			<EmptyState
				className="h-full w-full justify-center px-[30px] pt-10 pb-[95px]"
				heading="h1"
				art={<RibbonMark className="h-[38px] w-[30px] opacity-85" />}
				title="Your canvas is ready."
				description="Open this project in your agent. Edits appear here as you work."
				actions={
					root === undefined ? undefined : (
						<div className="flex max-w-full flex-col items-center gap-3">
							{onUseAgent && (
								<button
									type="button"
									disabled={renaming}
									className={`${AGENT_PRIMARY} pointer-events-auto mb-3 focus-ring`}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={onUseAgent}
								>
									Use my agent <ArrowRightIcon className="h-4 w-4 shrink-0" />
								</button>
							)}
							<code
								className="pointer-events-auto max-w-full select-text text-secondary [overflow-wrap:anywhere] type-detail"
								onPointerDown={(event) => event.stopPropagation()}
							>
								{root}
							</code>
							<button
								type="button"
								disabled={renaming}
								className="project-empty-copy pointer-events-auto inline-flex items-center justify-center rounded-xs text-secondary focus-ring type-control hover:text-primary"
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
								<span role="alert" className="text-secondary type-label">
									Could not copy. Select the path and copy it manually.
								</span>
							)}
						</div>
					)
				}
			/>
			<div className="project-empty-title absolute top-[21px] left-[27px] right-[27px] flex flex-col items-start gap-[7px] text-left [&>input]:w-[210px] [&>input]:max-w-full [&>input]:text-primary [&>input]:bg-transparent [&>input]:[outline:none] [&>input]:[font:var(--type-body)] [&>input]:p-[3px] [&>input]:ml-[-3px] [&>input]:rounded-[3px] [&>input]:pointer-events-auto [&>input:focus]:bg-surface-control [&>span]:text-secondary [&>span]:[font:var(--type-detail)] [&>span]:[font-feature-settings:var(--font-mono--font-feature-settings)] [&>p]:max-w-[360px] [&>p]:text-primary [&>p]:[font:var(--type-label)]">
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
					className="project-empty-folder -translate-x-1/2 pointer-events-auto absolute bottom-[91px] left-1/2 rounded-xs text-secondary focus-ring type-label hover:text-primary"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onFolder}
				>
					Open an existing project folder
				</button>
			)}
		</div>
	);
}
