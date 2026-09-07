import { ui } from "spool";
import { ProjectEntryPrototype } from "shared/ui/explore/project-entry/project-entry";

export default function ProjectEntryFrame() {
	ui.use();
	const name = typeof ui.state.projectEntryInstantName === "string" ? ui.state.projectEntryInstantName : "untitled";
	const location =
		typeof ui.state.projectEntryInstantLocation === "string" ? ui.state.projectEntryInstantLocation : "~/spool";
	return (
		<ProjectEntryPrototype
			take="instant"
			scene="home"
			project={name}
			hasProject={ui.state.projectEntryInstantExists === true}
			location={location}
			onCreate={(next, parent) => {
				ui.go("project-entry-instant--created", {
					projectEntryInstantExists: true,
					projectEntryInstantName: next,
					projectEntryInstantLocation: parent,
				});
			}}
			onOptions={() => ui.go("project-entry-instant--renaming")}
			onHome={() => ui.go("project-entry-instant")}
			onRename={(next) => {
				ui.state.projectEntryInstantName = next;
			}}
			onRestart={() =>
				ui.go("project-entry-instant", {
					projectEntryInstantExists: false,
					projectEntryInstantName: "untitled",
					projectEntryInstantLocation: "~/spool",
				})
			}
		/>
	);
}
