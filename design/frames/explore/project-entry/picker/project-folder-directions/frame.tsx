import { FolderDirections } from "shared/ui/explore/project-entry/folder-journey";
import { ArrowRightIcon } from "shared/ui/spool/icons";
export default function Frame() {
	return (
		<FolderDirections
			choices={
				<button type="button" data-go="project-folder-choices">
					Try three choices <ArrowRightIcon />
				</button>
			}
			nameFirst={
				<button type="button" data-go="project-folder-name-first">
					Try name first <ArrowRightIcon />
				</button>
			}
			folderFirst={
				<button type="button" data-go="project-folder-folder-first">
					Try the picker <ArrowRightIcon />
				</button>
			}
		/>
	);
}
