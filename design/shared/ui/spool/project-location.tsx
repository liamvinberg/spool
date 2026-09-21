export function ProjectLocation({ path, onChange }: { path: string; onChange: () => void }) {
	const display = path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
	return (
		<div className="pj-project-location mt-[24px] flex items-center gap-[10px] text-muted type-label [@media(max-width:720px)]:flex-wrap">
			<span className="shrink-0 whitespace-nowrap">Save projects in</span>
			<span className="pj-location-path min-w-0 truncate text-text" title={path}>
				{display
					.replace(/^~(?=\/|$)/, "Home")
					.split("/")
					.join(" / ")}
			</span>
			<button className="ml-[4px] shrink-0 whitespace-nowrap text-muted underline underline-offset-[3px] [&:hover]:text-text" type="button" onClick={onChange}>
				Change…
			</button>
		</div>
	);
}
