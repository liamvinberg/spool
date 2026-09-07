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
		<div className="pj-project-location">
			<span>Save in</span>
			<span className="pj-location-path" title={path}>
				{displayProjectPath(path)}
			</span>
			<button type="button" disabled={disabled} onClick={onChange}>
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
