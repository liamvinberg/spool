import { ui } from "spool";
import { ProjectEntryPrototype } from "shared/ui/explore/project-entry/project-entry";

export default function ProjectEntryFrame() {
	ui.use();
	const name = typeof ui.state.projectEntrySplitName === "string" ? ui.state.projectEntrySplitName : "untitled";
	const location =
		typeof ui.state.projectEntrySplitLocation === "string" ? ui.state.projectEntrySplitLocation : "~/spool";
	return (
		<ProjectEntryPrototype
			take="split"
			scene="home"
			project={name}
			hasProject={ui.state.projectEntrySplitExists === true}
			location={location}
			onCreate={(next, parent) => {
				ui.go("project-entry-split--created", {
					projectEntrySplitExists: true,
					projectEntrySplitName: next,
					projectEntrySplitLocation: parent,
				});
			}}
			onOptions={() => ui.go("project-entry-split--options")}
			onHome={() => ui.go("project-entry-split")}
			onRename={(next) => {
				ui.state.projectEntrySplitName = next;
			}}
			onRestart={() =>
				ui.go("project-entry-split", {
					projectEntrySplitExists: false,
					projectEntrySplitName: "untitled",
					projectEntrySplitLocation: "~/spool",
				})
			}
		/>
	);
}
