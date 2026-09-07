import { ui } from "spool";
import { FolderJourney, type FolderValues } from "shared/ui/explore/project-entry/folder-journey";

export default function Frame() {
	ui.use();
	const read = (field: string, fallback: string): string => {
		const value = ui.state["folderJourneyNameFirst" + field[0]?.toUpperCase() + field.slice(1)];
		return typeof value === "string" ? value : fallback;
	};
	const values: FolderValues = {
		pickerClosed: read("pickerClosed", "false"),
		hasResult: read("hasResult", "false"),
		draft: read("draft", ""),
		parent: read("parent", "~/spool"),
		home: read("home", "~/spool"),
		path: read("path", "~/projects"),
		selected: read("selected", "~/projects/tvärsö"),
		resultRoot: read("resultRoot", "~/projects/coffee-shop"),
		resultKind: read("resultKind", "setup"),
	};
	return (
		<FolderJourney
			take="name-first"
			scene="open"
			values={values}
			onChange={(patch) => {
				for (const [field, value] of Object.entries(patch))
					ui.state["folderJourneyNameFirst" + field[0]?.toUpperCase() + field.slice(1)] = value;
			}}
			onScene={(next) => {
				switch (next) {
					case "start":
						ui.go("project-folder-name-first");
						break;
					case "name":
						ui.go("project-folder-name-first--name");
						break;
					case "folder":
						ui.go("project-folder-name-first--folder");
						break;
					case "new-here":
						ui.go("project-folder-name-first--new-here");
						break;
					case "open":
						ui.go("project-folder-name-first--open");
						break;
					case "ready":
						ui.go("project-folder-name-first--ready");
						break;
				}
			}}
			onFinish={(root, kind) =>
				ui.go("project-folder-name-first--ready", {
					folderJourneyNameFirstResultRoot: root,
					folderJourneyNameFirstResultKind: kind,
					folderJourneyNameFirstHasResult: "true",
				})
			}
			onReset={() =>
				ui.go("project-folder-name-first", {
					folderJourneyNameFirstDraft: "",
					folderJourneyNameFirstParent: "~/spool",
					folderJourneyNameFirstHome: "~/spool",
					folderJourneyNameFirstPath: "~/projects",
					folderJourneyNameFirstSelected: "~/projects/coffee-shop",
					folderJourneyNameFirstResultRoot: "~/projects/coffee-shop",
					folderJourneyNameFirstResultKind: "setup",
					folderJourneyNameFirstHasResult: "false",
					folderJourneyNameFirstPickerClosed: "false",
				})
			}
		/>
	);
}
