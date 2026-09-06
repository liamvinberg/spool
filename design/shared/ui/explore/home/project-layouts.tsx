import { useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasArtwork, ProjectArtwork } from "./artwork";
import { projects, registry } from "./data";
import {
	Action,
	Arrow,
	EmptyProjects,
	Footer,
	Heading,
	type HomeActions,
	NewProject,
	ProjectMark,
	ProjectRow,
	ProjectTile,
	RegistryDoor,
	RegistryRow,
	Search,
	SectionHeading,
} from "./parts";

export function QuietHome({ actions }: { actions: HomeActions }) {
	return (
		<div className="home-page home-quiet">
			<Heading>
				<NewProject actions={actions} />
			</Heading>
			<Search actions={actions} />
			<div className="home-quiet-list">
				{actions.visible.map((project) => (
					<ProjectRow key={project.name} project={project} onClick={() => actions.openProject(project)} />
				))}
				{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
			</div>
			<div className="home-quiet-bottom">
				<Action onClick={actions.openFolder}>
					Open a folder
					<Arrow />
				</Action>
				<button type="button" onClick={actions.openRegistry}>
					Explore the registry
					<Arrow />
				</button>
			</div>
			<Footer actions={actions} />
		</div>
	);
}

export function CoversHome({ actions }: { actions: HomeActions }) {
	const [onlyRecent, setOnlyRecent] = useState(false);
	const shown = onlyRecent ? actions.visible.slice(0, 3) : actions.visible;
	return (
		<div className="home-page home-covers">
			<Heading>
				<Search actions={actions} />
				<NewProject actions={actions} />
			</Heading>
			<div className="home-filter-line">
				<div className="home-inline-tabs">
					<button type="button" aria-pressed={!onlyRecent} onClick={() => setOnlyRecent(false)}>
						All projects
					</button>
					<button type="button" aria-pressed={onlyRecent} onClick={() => setOnlyRecent(true)}>
						Recent
					</button>
				</div>
				<span>{shown.length} {shown.length === 1 ? "project" : "projects"}</span>
			</div>
			<div className="home-grid home-grid-three">
				{shown.map((project) => (
					<ProjectTile key={project.name} project={project} onClick={() => actions.openProject(project)} />
				))}
			</div>
			{shown.length === 0 && <EmptyProjects actions={actions} />}
			<Footer actions={actions} />
		</div>
	);
}

export function ShelfHome({ actions }: { actions: HomeActions }) {
	return (
		<div className="home-page home-shelf">
			<Heading title="Pick up where you left off.">
				<Action onClick={actions.openRegistry}>
					Registry
					<Arrow />
				</Action>
				<NewProject actions={actions} />
			</Heading>
			<div className="home-grid home-grid-three home-shelf-covers">
				{actions.visible.slice(0, 3).map((project) => (
					<ProjectTile canvas key={project.name} project={project} onClick={() => actions.openProject(project)} />
				))}
			</div>
			<div className="home-shelf-lower">
				<section>
					<SectionHeading>All projects</SectionHeading>
					<Search actions={actions} />
					{actions.visible.map((project) => (
						<ProjectRow
							compact
							key={project.name}
							project={project}
							onClick={() => actions.openProject(project)}
						/>
					))}
					{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
				</section>
				<aside>
					<SectionHeading action="Browse" onClick={actions.openRegistry}>
						Start with something
					</SectionHeading>
					<p>Bring a system or a familiar app into your next project.</p>
					{registry.slice(0, 2).map((item) => (
						<RegistryRow key={item.name} item={item} onClick={() => actions.inspectItem(item)} />
					))}
					{registry[4] && (
						<RegistryRow item={registry[4]} onClick={() => registry[4] && actions.inspectItem(registry[4])} />
					)}
				</aside>
			</div>
		</div>
	);
}

export function ResumeHome({ actions }: { actions: HomeActions }) {
	const first = actions.visible[0];
	return (
		<div className="home-page home-resume">
			<Heading title="Welcome back.">
				<Search actions={actions} />
				<NewProject actions={actions} />
			</Heading>
			<div className="home-resume-grid">
				<section>
					{first ? (
						<button type="button" className="home-resume-feature" onClick={() => actions.openProject(first)}>
							<ProjectArtwork kind={first.art} />
							<div>
								<span>
									<strong>Continue in {first.name}</strong>
									<span>
										{first.frames} frames · opened {first.when}
									</span>
								</span>
								<span className="home-resume-arrow">
									<Arrow />
								</span>
							</div>
						</button>
					) : (
						<EmptyProjects actions={actions} />
					)}
				</section>
				<aside>
					<SectionHeading>Your projects</SectionHeading>
					{actions.visible.map((project) => (
						<ProjectRow
							compact
							key={project.name}
							project={project}
							onClick={() => actions.openProject(project)}
						/>
					))}
					<button type="button" className="home-text-link" onClick={actions.openFolder}>
						Open another folder
						<Arrow />
					</button>
				</aside>
			</div>
			<RegistryDoor actions={actions} />
		</div>
	);
}

export function IndexHome({ actions }: { actions: HomeActions }) {
	const [previewName, setPreviewName] = useState(projects[0]?.name);
	const selected = actions.visible.find((project) => project.name === previewName) ?? actions.visible[0];
	return (
		<div className="home-index">
			<section className="home-index-list">
				<Heading>
					<NewProject actions={actions} />
				</Heading>
				<Search actions={actions} />
				<div className="home-index-rows">
					{actions.visible.map((project) => (
						<ProjectRow
							key={project.name}
							project={project}
							selected={selected?.name === project.name}
							onPreview={() => setPreviewName(project.name)}
							onClick={() => actions.openProject(project)}
						/>
					))}
					{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
				</div>
				<Footer actions={actions} />
			</section>
			<section className="home-index-preview">
				{selected ? (
					<>
						<div className="home-index-preview-top">
							<ProjectMark project={selected} />
							<span>{selected.name}</span>
							<span className="home-mono">{selected.frames} frames</span>
						</div>
						<div className="home-index-art">
							<ProjectArtwork kind={selected.art} />
						</div>
						<h2>{selected.description}</h2>
						<span className="home-mono">{selected.name}/design</span>
						<Action primary onClick={() => actions.openProject(selected)}>
							Open {selected.name}
							<Arrow />
						</Action>
					</>
				) : (
					<div className="home-empty">
						<h2>Select a project to preview.</h2>
					</div>
				)}
			</section>
		</div>
	);
}

export function SpacesHome({ actions }: { actions: HomeActions }) {
	const [space, setSpace] = useState("All projects");
	const shown = actions.visible.filter((project) => space === "All projects" || project.group === space);
	return (
		<div className="home-spaces">
			<aside className="home-side-nav">
				<div className="home-side-brand">spool</div>
				<NewProject actions={actions} />
				<nav aria-label="Project collections">
					{["All projects", "Personal", "Studio"].map((label) => (
						<button
							type="button"
							key={label}
							aria-current={space === label ? "page" : undefined}
							onClick={() => setSpace(label)}
						>
							<span className={cn("home-nav-glyph", label === "Studio" && "is-thread")}>
								{label === "All projects" ? "▦" : "◧"}
							</span>
							{label}
							<span>
								{label === "All projects"
									? actions.visible.length
									: actions.visible.filter((project) => project.group === label).length}
							</span>
						</button>
					))}
				</nav>
				<div className="home-side-rule" />
				<button type="button" className="home-nav-link" onClick={actions.openRegistry}>
					Registry
					<Arrow />
				</button>
				<div className="home-side-bottom">
					<span>On this Mac</span>
					<button type="button" onClick={actions.openFolder}>
						Open a folder ↗
					</button>
				</div>
			</aside>
			<div className="home-spaces-body">
				<Heading title={space}>
					<Search actions={actions} />
				</Heading>
				<div className="home-grid home-grid-three">
					{shown.map((project) => (
						<ProjectTile key={project.name} project={project} onClick={() => actions.openProject(project)} />
					))}
				</div>
				{shown.length === 0 && <EmptyProjects actions={actions} />}
				<RegistryDoor actions={actions} />
			</div>
		</div>
	);
}
