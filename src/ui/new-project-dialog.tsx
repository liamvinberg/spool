import { useState } from "react";
import { createProjectAt } from "./api";
import { ConfirmDialog } from "./confirm-dialog";
import { FolderPicker } from "./picker";
import { displayProjectPath, ProjectLocation } from "./project-location";
import "./new-project-dialog.css";

export function NewProjectDialog({
	location: initialLocation,
	onOpened,
	onClose,
}: {
	location: string | undefined;
	onOpened: (project: { root: string; name: string }) => void;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [chosenLocation, setLocation] = useState<string | null>(null);
	const location = chosenLocation ?? initialLocation;
	const [picking, setPicking] = useState(false);
	const path = `${location?.replace(/\/$/, "") ?? ""}/${name.trim()}`;
	return (
		<>
			<ConfirmDialog
				title="New project"
				confirmLabel="Create project"
				disabled={picking || location === undefined}
				onClose={onClose}
				onConfirm={async () => {
					if (location === undefined) throw new Error("The project location is still loading.");
					const outcome = await createProjectAt(location, name.trim());
					if (outcome.kind === "opened") onOpened(outcome);
					else
						throw new Error(
							outcome.kind === "error" ? outcome.message : "Could not create the project. Try again.",
						);
				}}
			>
				<div className="new-project-fields">
					<label>
						Name (optional)
						<input
							value={name}
							placeholder="Untitled"
							onChange={(event) => setName(event.target.value)}
							spellCheck={false}
							autoComplete="off"
						/>
					</label>
					<ProjectLocation
						path={location ?? "Loading…"}
						disabled={location === undefined}
						onChange={() => setPicking(true)}
					/>
					<code title={name.trim() === "" ? location : path}>
						{name.trim() === "" ? (
							"Creates an untitled folder here."
						) : (
							<>
								<span>Creates </span>
								<span className="new-project-parent">{displayProjectPath(location ?? "")} / </span>
								<span className="new-project-name">{name.trim()}</span>
							</>
						)}
					</code>
				</div>
			</ConfirmDialog>
			{picking && location !== undefined && (
				<FolderPicker
					initial="location"
					location={location}
					onOpened={onOpened}
					onClose={() => setPicking(false)}
					onLocation={async (path) => {
						setLocation(path);
						return { ok: true };
					}}
				/>
			)}
		</>
	);
}
