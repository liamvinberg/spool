import { useEffect, useState } from "react";
import { ForgetToast } from "./forget-toast";
import { Home } from "./home";
import { homeProjects, type ProjectCard } from "./home-fixture";
import { ProjectPicker, type ProjectPickerMode } from "./project-picker";
import { SpoolShell } from "./shell";

/** Production home with local project fixtures standing in for the daemon. */
export function SpoolHomeScreen({
	canvasTarget = "spool-canvas",
	emptyTarget = "spool-empty-project",
	overlay,
	firstLaunch = false,
	initialPicker = null,
	initialName = "",
	initialLocation = "~/spool",
	onGo,
}: {
	canvasTarget?: string | undefined;
	emptyTarget?: string | undefined;
	overlay?: React.ReactNode | undefined;
	firstLaunch?: boolean;
	initialPicker?: ProjectPickerMode | null;
	initialName?: string;
	initialLocation?: string;
	onGo?: ((target: string) => void) | undefined;
}) {
	const [projects, setProjects] = useState(firstLaunch ? [] : homeProjects);
	const [location, setLocation] = useState(initialLocation);
	const [picker, setPicker] = useState(initialPicker);
	const [removed, setRemoved] = useState<ProjectCard | null>(null);
	useEffect(() => {
		if (removed === null) return;
		const timer = setTimeout(() => setRemoved(null), 5000);
		return () => clearTimeout(timer);
	}, [removed]);

	const start = () => setPicker("start");
	return (
		<SpoolShell
			canvasControls={false}
			tabs={firstLaunch ? [] : ["tvärsö", "kaffe"]}
			onPick={() => setPicker("start")}
		>
			<div className="relative h-full">
				<Home
					projects={projects}
					location={location}
					onStart={start}
					onFolder={() => setPicker("folder")}
					onChangeLocation={() => setPicker("location")}
					onOpenProject={(project) =>
						onGo?.(
							projects.find((item) => item.root === project.root)?.frameCount === 0 ? emptyTarget : canvasTarget,
						)
					}
					onForgetProject={(project) => {
						setRemoved(projects.find((item) => item.root === project.root) ?? null);
						setProjects((items) => items.filter((item) => item.root !== project.root));
					}}
				/>
				{removed && (
					<ForgetToast
						name={removed.name}
						windowMs={5000}
						onUndo={() => {
							setProjects((items) => [...items, removed]);
							setRemoved(null);
						}}
					/>
				)}
				{picker && (
					<ProjectPicker
						key={picker}
						initial={picker}
						initialName={initialName}
						location={location}
						onClose={() => setPicker(null)}
						onOpened={(project) => {
							setPicker(null);
							onGo?.(
								(projects.find((item) => item.name === project.name)?.frameCount ?? 0) > 0
									? canvasTarget
									: emptyTarget,
							);
						}}
						{...(picker === "location"
							? {
									onLocation: async (path: string) => {
										setLocation(path);
										return { ok: true };
									},
								}
							: {})}
					/>
				)}

				{overlay}
			</div>
		</SpoolShell>
	);
}
