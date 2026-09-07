import { EntryDirections } from "shared/ui/explore/project-entry/project-entry";

export default function Directions() {
	return (
		<EntryDirections
			instant={
				<button type="button" data-go="project-entry-instant">
					Try immediate creation <span>→</span>
				</button>
			}
			split={
				<button type="button" data-go="project-entry-split">
					Try the split button <span>→</span>
				</button>
			}
			inline={
				<button type="button" data-go="project-entry-inline">
					Try naming in Home <span>→</span>
				</button>
			}
		/>
	);
}
