import { ui } from "spool";
import { ProjectEntryPrototype } from "shared/ui/explore/project-entry/project-entry";

export default function ProjectEntryFrame() {
	ui.use();
	const name = typeof ui.state.projectEntryInlineName === "string" ? ui.state.projectEntryInlineName : "untitled";
	const location =
		typeof ui.state.projectEntryInlineLocation === "string" ? ui.state.projectEntryInlineLocation : "~/spool";
	return (
		<ProjectEntryPrototype
			take="inline"
			scene="created"
			project={name}
			hasProject={ui.state.projectEntryInlineExists === true}
			location={location}
			onCreate={(next, parent) => {
				ui.go("project-entry-inline--created", {
					projectEntryInlineExists: true,
					projectEntryInlineName: next,
					projectEntryInlineLocation: parent,
				});
			}}
			onOptions={() => ui.go("project-entry-inline--naming")}
			onHome={() => ui.go("project-entry-inline")}
			onRename={(next) => {
				ui.state.projectEntryInlineName = next;
			}}
			onRestart={() =>
				ui.go("project-entry-inline", {
					projectEntryInlineExists: false,
					projectEntryInlineName: "untitled",
					projectEntryInlineLocation: "~/spool",
				})
			}
		/>
	);
}
