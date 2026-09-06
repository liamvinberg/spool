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
	onGo,
}: {
	canvasTarget?: string | undefined;
	emptyTarget?: string | undefined;
	overlay?: React.ReactNode | undefined;
	firstLaunch?: boolean;
	initialPicker?: ProjectPickerMode | null;
	onGo?: ((target: string) => void) | undefined;
}) {
	const [projects, setProjects] = useState(firstLaunch ? [] : homeProjects);
	const [location, setLocation] = useState("~/spool");
	const [picker, setPicker] = useState(initialPicker);
	const [removed, setRemoved] = useState<ProjectCard | null>(null);
	useEffect(() => {
		if (removed === null) return;
		const timer = setTimeout(() => setRemoved(null), 5000);
		return () => clearTimeout(timer);
	}, [removed]);

	const start = () => onGo?.(emptyTarget);
	return (
		<SpoolShell canvasControls={false} tabs={firstLaunch ? [] : ["tvärsö", "kaffe"]} onPick={() => setPicker("start")}>
			<div className="relative h-full">
				<Home projects={projects} location={location} onStart={start} onFolder={() => setPicker("folder")}
					onChangeLocation={() => setPicker("location")}
					onOpenProject={(project) => onGo?.(projects.find((item) => item.root === project.root)?.frameCount === 0 ? emptyTarget : canvasTarget)}
					onForgetProject={(project) => {
						setRemoved(projects.find((item) => item.root === project.root) ?? null);
						setProjects((items) => items.filter((item) => item.root !== project.root));
					}} />
				{removed && <ForgetToast name={removed.name} windowMs={5000} onUndo={() => {
					setProjects((items) => [...items, removed]);
					setRemoved(null);
				}} />}
				{picker && <ProjectPicker key={picker} initial={picker} projectLocation={location}
					onClose={() => setPicker(null)} onScratch={start} onCreate={start}
					onOpen={() => onGo?.(canvasTarget)} onChangeLocation={() => setPicker("location")}
					onLocation={(path) => { setLocation(path); setPicker(null); }} />}
				{overlay}
			</div>
		</SpoolShell>
	);
}
