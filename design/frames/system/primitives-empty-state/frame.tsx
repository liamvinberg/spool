import { EmptyFramesIcon, EmptyState } from "shared/ui/spool/empty-state";
import { SearchIcon } from "shared/ui/spool/icons";

export default function Frame() {
	return (
		<div className="flex h-full flex-col bg-bg p-12 font-sans text-text antialiased">
			<h1 className="text-[28px]">Empty screen</h1>
			<p className="mt-3 text-base text-muted">
				The same composition, with the icon and content supplied by its caller.
			</p>
			<div className="grid flex-1 grid-cols-2 divide-x divide-border">
				<EmptyState
					icon={<EmptyFramesIcon />}
					title="Your projects start here."
					description="Create a project, or open a folder you already have."
				/>
				<EmptyState
					icon={<SearchIcon />}
					title="No matching projects."
					description="Try another name or part of a folder path."
				/>
			</div>
		</div>
	);
}
