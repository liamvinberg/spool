import { useState } from "react";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { ProjectEmpty } from "shared/ui/spool/project-empty";
import { ProjectPicker, type ProjectPickerMode } from "shared/ui/spool/project-picker";
import { SpoolShell } from "shared/ui/spool/shell";

/** The app's empty canvas, with a local rename standing in for the folder operation. */
export function SpoolEmptyScreen({
	homeTarget,
	project = "untitled",
}: {
	homeTarget?: string | undefined;
	project?: string | undefined;
}) {
	const [name, setName] = useState(project);
	const [picker, setPicker] = useState<ProjectPickerMode | null>(null);
	const [location, setLocation] = useState("~/spool");
	const open = (next: string) => {
		setName(next);
		setPicker(null);
	};
	return (
		<SpoolShell activeTab={name} tabs={[name]} homeTarget={homeTarget} zoom="100%">
			<CanvasChrome pages={[]} tool="none">
				<ProjectEmpty
					key={name}
					project={name}
					root={`${location}/${name}`}
					onFolder={() => setPicker("folder")}
					onRename={async (next) => {
						if (!next || next.startsWith(".") || next.includes("/") || next.includes("\\"))
							throw new Error("Use a folder name without slashes or a leading dot.");
						setName(next);
					}}
				/>
			</CanvasChrome>
			{picker && (
				<ProjectPicker
					key={picker}
					initial={picker}
					location={location}
					onClose={() => setPicker(null)}
					onOpened={(project) => {
						setLocation(project.root.slice(0, project.root.lastIndexOf("/")));
						open(project.name);
					}}
				/>
			)}
		</SpoolShell>
	);
}
