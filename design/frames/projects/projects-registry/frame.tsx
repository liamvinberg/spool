import { ProjectsRegistryScreen } from "../../../shared/ui/projects-registry-screen";

export default function ProjectsRegistryFrame() {
	return <ProjectsRegistryScreen canvasTarget="spool-canvas--live" menuTrigger="corner" removal="undo" />;
}
