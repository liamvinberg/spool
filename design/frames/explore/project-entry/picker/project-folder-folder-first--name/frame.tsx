import { ui } from "spool";
import { FolderJourney, type FolderValues } from "shared/ui/explore/project-entry/folder-journey";

export default function Frame() {
	ui.use();
	const read = (field: string, fallback: string): string => {
		const value = ui.state["folderJourneyFolderFirst" + field[0]?.toUpperCase() + field.slice(1)];
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
			take="folder-first"
			scene="name"
			values={values}
			onChange={(patch) => {
				for (const [field, value] of Object.entries(patch))
					ui.state["folderJourneyFolderFirst" + field[0]?.toUpperCase() + field.slice(1)] = value;
			}}
			onScene={(next) => {
				switch (next) {
					case "start":
						ui.go("project-folder-folder-first");
						break;
					case "name":
						ui.go("project-folder-folder-first--name");
						break;
					case "folder":
						ui.go("project-folder-folder-first--folder");
						break;
					case "new-here":
						ui.go("project-folder-folder-first--new-here");
						break;
					case "open":
						ui.go("project-folder-folder-first--open");
						break;
					case "ready":
						ui.go("project-folder-folder-first--ready");
						break;
				}
			}}
			onFinish={(root, kind) =>
				ui.go("project-folder-folder-first--ready", {
					folderJourneyFolderFirstResultRoot: root,
					folderJourneyFolderFirstResultKind: kind,
					folderJourneyFolderFirstHasResult: "true",
				})
			}
			onReset={() =>
				ui.go("project-folder-folder-first", {
					folderJourneyFolderFirstDraft: "",
					folderJourneyFolderFirstParent: "~/spool",
					folderJourneyFolderFirstHome: "~/spool",
					folderJourneyFolderFirstPath: "~/projects",
					folderJourneyFolderFirstSelected: "~/projects/coffee-shop",
					folderJourneyFolderFirstResultRoot: "~/projects/coffee-shop",
					folderJourneyFolderFirstResultKind: "setup",
					folderJourneyFolderFirstHasResult: "false",
					folderJourneyFolderFirstPickerClosed: "false",
				})
			}
		/>
	);
}
