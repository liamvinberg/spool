export function ProjectLocation({ path, onChange }: { path: string; onChange: () => void }) {
	const display = path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
	return (
		<div className="pj-project-location">
			<span>Save projects in</span>
			<span className="pj-location-path" title={path}>
				{display
					.replace(/^~(?=\/|$)/, "Home")
					.split("/")
					.join(" / ")}
			</span>
			<button type="button" onClick={onChange}>
				Change…
			</button>
		</div>
	);
}
