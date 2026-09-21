export function ProjectLocation({
	path,
	onChange,
	disabled = false,
}: {
	path: string;
	onChange: () => void;
	disabled?: boolean;
}) {
	return (
		<div className="pj-project-location mt-[24px] flex items-center gap-[10px] text-muted type-label [@media(max-width:720px)]:flex-wrap">
			<span className="shrink-0 whitespace-nowrap">Save in</span>
			<span className="pj-location-path min-w-0 truncate text-text" title={path}>
				{displayProjectPath(path)}
			</span>
			<button
				className="ml-[4px] shrink-0 whitespace-nowrap text-muted underline underline-offset-[3px] [&:hover]:text-text"
				type="button"
				disabled={disabled}
				onClick={onChange}
			>
				Change…
			</button>
		</div>
	);
}

export function displayProjectPath(path: string): string {
	return path
		.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~")
		.replace(/^~(?=\/|$)/, "Home")
		.split("/")
		.join(" / ");
}
