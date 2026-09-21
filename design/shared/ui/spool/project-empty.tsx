import { useRef, useState } from "react";
import { EmptyState } from "shared/ui/spool/empty-state";
import { ArrowRightIcon } from "shared/ui/spool/icons";
import { SpoolMark as RibbonMark } from "shared/ui/spool/mark";

/** The empty project's name belongs to its folder; only a successful rename changes it. */
export function ProjectEmpty({
	project,
	root,
	onRename,
	onFolder,
}: {
	project: string;
	root?: string | undefined;
	onRename?: ((name: string) => Promise<void>) | undefined;
	onFolder?: (() => void) | undefined;
}) {
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
			await onRename(name);
			setDraft(name);
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
			className="project-empty relative h-full w-full [padding:40px_30px_95px] [&.project-empty>svg]:w-[30px] [&.project-empty>svg]:h-[38px] [&.project-empty>svg]:text-thread [&.project-empty>svg]:mb-[24px] [&.project-empty>svg]:opacity-[0.85] [&>p]:[font:var(--type-body)] [&>p]:max-w-[340px]  [&>.spool-empty-actions]:flex-col [&>.spool-empty-actions]:flex-nowrap [&>.spool-empty-actions]:max-w-full [&>.spool-empty-actions]:mt-[26px] [&>.spool-empty-actions]:gap-[15px] [&>.spool-empty-actions>code]:max-w-full [&>.spool-empty-actions>code]:text-muted [&>.spool-empty-actions>code]:[font:var(--type-detail)] [&>.spool-empty-actions>code]:[font-feature-settings:var(--font-mono--font-feature-settings)] [&>.spool-empty-actions>code]:[overflow-wrap:anywhere] [&>.spool-empty-actions>code]:select-text [&>.spool-empty-actions>code]:pointer-events-auto "
			heading="h1"
			icon={<RibbonMark />}
			title="Your canvas is ready."
			description="Ask your agent here, or open this project with Claude Code or Codex and tell it what you’d like to design."
			actions={
				root === undefined ? undefined : (
					<>
						<code onPointerDown={(event) => event.stopPropagation()}>{root}</code>
						<button
							type="button"
							disabled={renaming}
							className="project-empty-copy inline-flex items-center justify-center gap-[9px] min-h-[34px] px-[13px] py-0 border border-border-raised rounded-[7px] text-text [&:hover]:bg-raised [font:var(--type-control)] pointer-events-auto [&>svg]:w-[14px] [&>svg]:h-[14px]"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => {
								void navigator.clipboard
									.writeText(root)
									.then(() => {
										setCopied(true);
										setCopyFailed(false);
									})
									.catch(() => setCopyFailed(true));
							}}
						>
							{copied ? "Copied" : "Copy project path"}
							<ArrowRightIcon />
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
			<div className="project-empty-title absolute top-[21px] left-[27px] right-[27px] flex flex-col items-start gap-[7px] text-left [&>input]:w-[210px] [&>input]:max-w-full [&>input]:text-text [&>input]:bg-transparent [&>input]:[outline:none] [&>input]:[font:var(--type-body)] [&>input]:p-[3px] [&>input]:ml-[-3px] [&>input]:rounded-[3px] [&>input]:pointer-events-auto [&>input:focus]:bg-raised [&>span]:text-muted [&>span]:[font:var(--type-detail)] [&>span]:[font-feature-settings:var(--font-mono--font-feature-settings)] [&>p]:max-w-[360px] [&>p]:text-text [&>p]:[font:var(--type-label)]">
				<input
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
					className="project-empty-folder absolute bottom-[91px] text-muted [font:var(--type-label)] pointer-events-auto [&:hover]:text-text"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onFolder}
				>
					Open an existing project folder
				</button>
			)}
		</EmptyState>
	);
}
