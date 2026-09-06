import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "../artwork";
import { Arrow, ProjectMark, Search } from "../parts";
import {
	ManageProject,
	PreviewDetails,
	type ProjectActions,
	ProjectCover,
	ProjectEmpty,
	ProjectHeading,
	ProjectList,
	ProjectNavigation,
	ProjectTable,
	ProjectToolbar,
} from "./parts";

export function SidebarCovers({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-sidebar-covers">
			<ProjectNavigation actions={actions} />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-covers-grid">
					{actions.projects.map((project) => (
						<ProjectCover key={project.name} project={project} actions={actions} />
					))}
				</div>
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</div>
		</div>
	);
}

export function SidebarCanvases({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-sidebar-canvases">
			<ProjectNavigation actions={actions} />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-covers-grid">
					{actions.projects.map((project) => (
						<ProjectCover canvas key={project.name} project={project} actions={actions} />
					))}
				</div>
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</div>
		</div>
	);
}

export function SidebarList({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-sidebar-list">
			<ProjectNavigation actions={actions} />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<ProjectTable actions={actions} />
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
				<div className="pj-list-foot">{actions.projects.length > 0 && <span>projects on this mac</span>}</div>
			</div>
		</div>
	);
}

export function RailCovers({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-rail-covers">
			<ProjectNavigation actions={actions} rail />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-covers-grid">
					{actions.projects.map((project) => (
						<ProjectCover key={project.name} project={project} actions={actions} />
					))}
				</div>
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</div>
		</div>
	);
}

export function RailCanvases({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-rail-canvases">
			<ProjectNavigation actions={actions} rail />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-covers-grid">
					{actions.projects.slice(0, 4).map((project) => (
						<ProjectCover canvas key={project.name} project={project} actions={actions} />
					))}
				</div>
				<div className="pj-canvas-remainder">
					{actions.projects.slice(4).map((project) => (
						<button type="button" key={project.name} onClick={() => actions.open(project)}>
							<ProjectMark project={project} />
							<strong>{project.name}</strong>
							<span>{project.frames} frames</span>
							<Arrow />
						</button>
					))}
				</div>
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</div>
		</div>
	);
}

export function RailRows({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-rail-rows">
			<ProjectNavigation actions={actions} rail />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-editorial-rows">
					{actions.projects.map((project) => (
						<article className="pj-editorial-row" key={project.name}>
							<button
								type="button"
								className="pj-editorial-open"
								aria-label={`Open ${project.name}`}
								onClick={() => actions.open(project)}
							>
								<div className="pj-row-cover">
									<ProjectArtwork kind={project.art} />
								</div>
								<div className="pj-row-title">
									<strong>{project.name}</strong>
									<span>projects/{project.name}/design</span>
								</div>
								<span className="pj-row-count">{project.frames} frames</span>
								<span className="pj-row-when">{project.when}</span>
								<Arrow />
							</button>
							<ManageProject project={project} actions={actions} />
						</article>
					))}
				</div>
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</div>
		</div>
	);
}

export function BrowserPreview({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-browser-preview">
			<ProjectNavigation actions={actions} rail />
			<section className="pj-browser-list">
				<ProjectHeading actions={actions} search={false} />
				<Search actions={actions} />
				<ProjectToolbar actions={actions} />
				<ProjectList actions={actions} thumbnails />
				{!actions.projects.length && <ProjectEmpty actions={actions} />}
			</section>
			<section className="pj-preview-panel">
				{actions.selected && (
					<>
						<div className="pj-preview-stage">
							<div className="pj-preview-page" key={actions.selected.name}>
								<ProjectArtwork kind={actions.selected.art} />
							</div>
						</div>
						<PreviewDetails project={actions.selected} actions={actions} />
					</>
				)}
			</section>
		</div>
	);
}

export function BrowserFilmstrip({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-browser-filmstrip">
			<ProjectNavigation actions={actions} />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				{actions.selected ? (
					<>
						<div className="pj-filmstrip-preview">
							<div className="pj-filmstrip-image" key={actions.selected.name}>
								<ProjectArtwork kind={actions.selected.art} />
							</div>
							<PreviewDetails project={actions.selected} actions={actions}>
								<p className="pj-filmstrip-description">{actions.selected.description}</p>
							</PreviewDetails>
						</div>
						<div className="pj-filmstrip" aria-label="Choose a project">
							{actions.projects.map((project) => (
								<button
									type="button"
									key={project.name}
									className={cn(project.name === actions.selected?.name && "is-selected")}
									aria-label={`Preview ${project.name}`}
									aria-pressed={project.name === actions.selected?.name}
									onClick={() => actions.select(project)}
									onDoubleClick={() => actions.open(project)}
								>
									<ProjectArtwork kind={project.art} />
									<strong>{project.name}</strong>
								</button>
							))}
						</div>
					</>
				) : (
					<ProjectEmpty actions={actions} />
				)}
			</div>
		</div>
	);
}

export function BrowserTable({ actions }: { actions: ProjectActions }) {
	return (
		<div className="pj-layout pj-browser-table">
			<ProjectNavigation actions={actions} />
			<div className="pj-main">
				<ProjectHeading actions={actions} />
				<ProjectToolbar actions={actions} />
				<div className="pj-table-and-preview">
					<section>
						<ProjectTable actions={actions} preview />
						{!actions.projects.length && <ProjectEmpty actions={actions} />}
					</section>
					<aside className="pj-table-detail">
						{actions.selected && (
							<>
								<div className="pj-detail-art" key={actions.selected.name}>
									<ProjectArtwork kind={actions.selected.art} />
								</div>
								<PreviewDetails project={actions.selected} actions={actions} />
								<p>{actions.selected.description}</p>
							</>
						)}
					</aside>
				</div>
			</div>
		</div>
	);
}
