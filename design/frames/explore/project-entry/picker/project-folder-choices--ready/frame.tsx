import { ui } from "spool";
import { FolderJourney, type FolderValues } from "shared/ui/explore/project-entry/folder-journey";

export default function Frame() {
	ui.use();
	const read = (field: string, fallback: string): string => {
		const value = ui.state["folderJourneyChoices" + field[0]?.toUpperCase() + field.slice(1)];
		return typeof value === "string" ? value : fallback;
	};
	const values: FolderValues = {
		pickerClosed: read("pickerClosed", "false"),
		hasResult: read("hasResult", "false"),
		draft: read("draft", ""),
		parent: read("parent", "~/spool"),
		home: read("home", "~/spool"),
		path: read("path", "~/projects"),
		selected: read("selected", "~/projects/coffee-shop"),
		resultRoot: read("resultRoot", "~/projects/coffee-shop"),
		resultKind: read("resultKind", "setup"),
	};
	return (
		<FolderJourney
			take="choices"
			scene="ready"
			values={values}
			onChange={(patch) => {
				for (const [field, value] of Object.entries(patch))
					ui.state["folderJourneyChoices" + field[0]?.toUpperCase() + field.slice(1)] = value;
			}}
			onScene={(next) => {
				switch (next) {
					case "start":
						ui.go("project-folder-choices");
						break;
					case "name":
						ui.go("project-folder-choices--name");
						break;
					case "folder":
						ui.go("project-folder-choices--folder");
						break;
					case "new-here":
						ui.go("project-folder-choices--new-here");
						break;
					case "open":
						ui.go("project-folder-choices--open");
						break;
					case "ready":
						ui.go("project-folder-choices--ready");
						break;
				}
			}}
			onFinish={(root, kind) =>
				ui.go("project-folder-choices--ready", {
					folderJourneyChoicesResultRoot: root,
					folderJourneyChoicesResultKind: kind,
					folderJourneyChoicesHasResult: "true",
				})
			}
			onReset={() =>
				ui.go("project-folder-choices", {
					folderJourneyChoicesDraft: "",
					folderJourneyChoicesParent: "~/spool",
					folderJourneyChoicesHome: "~/spool",
					folderJourneyChoicesPath: "~/projects",
					folderJourneyChoicesSelected: "~/projects/coffee-shop",
					folderJourneyChoicesResultRoot: "~/projects/coffee-shop",
					folderJourneyChoicesResultKind: "setup",
					folderJourneyChoicesHasResult: "false",
					folderJourneyChoicesPickerClosed: "false",
				})
			}
		/>
	);
}
