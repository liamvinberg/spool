import { useState } from "react";
import { cn } from "shared/lib/utils";
import { PlusIcon } from "shared/ui/spool/icons";
import { CanvasArtwork, ProjectArtwork } from "shared/ui/demo/home-artwork";
import { categories, type Category, registry } from "shared/ui/demo/home-data";
import {
	Action,
	Arrow,
	EmptyProjects,
	Heading,
	type HomeActions,
	NewProject,
	ProjectMark,
	ProjectRow,
	ProjectTile,
	RegistryRow,
	RegistryTile,
	Search,
	SectionHeading,
} from "./parts";

export function WorkbenchHome({ actions }: { actions: HomeActions }) {
	return (
		<div className="home-page home-workbench">
			<Heading title="Home">
				<Search actions={actions} />
				<NewProject actions={actions} />
			</Heading>
			<div className="home-workbench-columns">
				<div>
					<SectionHeading>Recent projects</SectionHeading>
					<div className="home-grid home-grid-two">
						{actions.visible.slice(0, 2).map((project) => (
							<ProjectTile key={project.name} project={project} onClick={() => actions.openProject(project)} />
						))}
					</div>
					<div className="home-workbench-list">
						{actions.visible.slice(2).map((project) => (
							<ProjectRow
								compact
								key={project.name}
								project={project}
								onClick={() => actions.openProject(project)}
							/>
						))}
					</div>
					{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
				</div>
				<aside>
					<SectionHeading action="Browse" onClick={actions.openRegistry}>
						Your registry
					</SectionHeading>
					<p>The pieces you reach for again.</p>
					{registry
						.filter((item) => item.source === "my-registry")
						.map((item) => (
							<RegistryRow key={item.name} item={item} onClick={() => actions.inspectItem(item)} />
						))}
					<div className="home-workbench-discover">
						<SectionHeading>From the public registry</SectionHeading>
						{registry[0] && (
							<RegistryTile item={registry[0]} onClick={() => registry[0] && actions.inspectItem(registry[0])} />
						)}
					</div>
					<button type="button" className="home-text-link" onClick={actions.openRegistry}>
						Explore app surfaces
						<Arrow />
					</button>
				</aside>
			</div>
		</div>
	);
}

export function LibraryHome({ actions }: { actions: HomeActions }) {
	const [category, setCategory] = useState<Category>("All");
	const shown = registry.filter((item) => category === "All" || item.kind === category);
	return (
		<div className="home-page home-library">
			<Heading title="Home">
				<Action onClick={actions.openRegistry}>
					Your registries
					<Arrow />
				</Action>
				<NewProject actions={actions} />
			</Heading>
			<div className="home-library-projects">
				{actions.visible.slice(0, 4).map((project) => (
					<button type="button" key={project.name} onClick={() => actions.openProject(project)}>
						<ProjectMark project={project} />
						<span>
							<strong>{project.name}</strong>
							<small>{project.when}</small>
						</span>
						<Arrow />
					</button>
				))}
			</div>
			<div className="home-library-intro">
				<h2>A place to start.</h2>
				<p>Use a design system, borrow a section, or bring an app into the flow.</p>
			</div>
			<div className="home-category-tabs" aria-label="Registry categories">
				{categories.map((name) => (
					<button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>
						{name}
					</button>
				))}
			</div>
			<div className="home-grid home-grid-three">
				{shown.map((item) => (
					<RegistryTile key={item.name} item={item} onClick={() => actions.inspectItem(item)} />
				))}
			</div>
		</div>
	);
}

export function SearchHome({ actions }: { actions: HomeActions }) {
	const matches = registry.filter((item) =>
		`${item.name} ${item.kind}`.toLowerCase().includes(actions.query.toLowerCase()),
	);
	return (
		<div className="home-page home-search-first">
			<div className="home-search-wordmark">
				spool
				<span />
			</div>
			<h1>Where do you want to go?</h1>
			<Search actions={actions} placeholder="Find a project, system, or app…" large />
			<div className="home-search-results">
				<section>
					<SectionHeading>{actions.query ? "Projects" : "Jump back in"}</SectionHeading>
					{actions.visible.slice(0, 4).map((project) => (
						<ProjectRow
							compact
							key={project.name}
							project={project}
							onClick={() => actions.openProject(project)}
						/>
					))}
				</section>
				<section>
					<SectionHeading action="Browse" onClick={actions.openRegistry}>
						Registry
					</SectionHeading>
					{matches.slice(0, 3).map((item) => (
						<RegistryRow key={item.name} item={item} onClick={() => actions.inspectItem(item)} />
					))}
				</section>
			</div>
			{actions.visible.length === 0 && matches.length === 0 && <EmptyProjects actions={actions} />}
			<div className="home-search-new">
				<NewProject actions={actions} />
				<Action onClick={actions.openFolder}>
					Open a folder
					<Arrow />
				</Action>
			</div>
		</div>
	);
}

export function StartHome({ actions }: { actions: HomeActions }) {
	const [name, setName] = useState("");
	const [starter, setStarter] = useState("Blank canvas");
	const start = () =>
		actions.create(
			registry.find((item) => item.name === starter),
			name,
		);
	return (
		<div className="home-start">
			<div className="home-start-main">
				<h1>What are you making?</h1>
				<p>Give your next idea a place to take shape.</p>
				<div>
					<label className="home-start-name">
						Project name
						<input
							aria-label="Project name"
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									start();
								}
							}}
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="A name for your idea"
						/>
					</label>
					<div className="home-start-choices">
						{["Blank canvas", "spool", "Slack"].map((choice) => (
							<button
								type="button"
								aria-pressed={starter === choice}
								key={choice}
								onClick={() => setStarter(choice)}
							>
								<span>{choice === "Blank canvas" ? "+" : choice === "spool" ? "Aa" : "#"}</span>
								<strong>
									{choice === "spool" ? "Design system" : choice === "Slack" ? "App flow" : choice}
								</strong>
								<small>
									{choice === "Blank canvas"
										? "Start with space"
										: choice === "spool"
											? "A shared foundation"
											: "Bring Slack along"}
								</small>
							</button>
						))}
					</div>
					<button type="button" onClick={start} className="home-action home-action-primary">
						{name ? `Start ${name}` : "Start a project"}
						<Arrow />
					</button>
				</div>
				<button type="button" className="home-text-link" onClick={actions.openRegistry}>
					More starting points in the registry
					<Arrow />
				</button>
			</div>
			<aside>
				<SectionHeading>Or pick up a project</SectionHeading>
				<Search actions={actions} />
				{actions.visible.map((project) => (
					<ProjectRow compact key={project.name} project={project} onClick={() => actions.openProject(project)} />
				))}
				{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
				<button type="button" className="home-text-link" onClick={actions.openFolder}>
					Open a folder
					<Arrow />
				</button>
			</aside>
		</div>
	);
}

export function DeskHome({ actions }: { actions: HomeActions }) {
	return (
		<div className="home-desk">
			<div className="home-desk-top">
				<div>
					<h1>Your desk.</h1>
					<p>A few things in progress.</p>
				</div>
				<Search actions={actions} />
				<NewProject actions={actions} />
			</div>
			<div className="home-desk-projects">
				{actions.visible.slice(0, 4).map((project, index) => (
					<button
						type="button"
						key={project.name}
						className={cn("home-desk-project", `home-desk-position-${index}`)}
						onClick={() => actions.openProject(project)}
					>
						<span className="home-desk-label">
							<strong>{project.name}</strong>
							<small>{project.when}</small>
						</span>
						{index === 0 ? <CanvasArtwork kind={project.art} /> : <ProjectArtwork kind={project.art} />}
					</button>
				))}
			</div>
			{actions.visible.length === 0 && <EmptyProjects actions={actions} />}
			<div className="home-desk-bottom">
				<button type="button" className="home-desk-new" onClick={() => actions.create()}>
					<PlusIcon className="h-5 w-5" />
					<span>Start something</span>
				</button>
				<button type="button" className="home-desk-registry" onClick={actions.openRegistry}>
					<span className="home-desk-stack">
						<i />
						<i />
						<i>Aa</i>
					</span>
					<span>
						<strong>Your materials</strong>
						<small>Systems, sections, and app surfaces</small>
					</span>
					<Arrow />
				</button>
			</div>
		</div>
	);
}

export function BrowserHome({ actions }: { actions: HomeActions }) {
	const [collection, setCollection] = useState("Everything");
	const [selection, setSelection] = useState(registry[1] ?? registry[0]);
	const shown = registry.filter(
		(item) =>
			(collection === "Everything" || collection === item.kind || collection === item.source) &&
			`${item.name} ${item.kind}`.toLowerCase().includes(actions.query.toLowerCase()),
	);
	return (
		<div className="home-browser">
			<aside className="home-side-nav">
				<div className="home-side-brand">spool</div>
				<NewProject actions={actions} />
				<nav aria-label="Library collections">
					{["Everything", "Design systems", "Sections", "Components", "App surfaces"].map((name) => (
						<button
							type="button"
							key={name}
							aria-current={collection === name ? "page" : undefined}
							onClick={() => setCollection(name)}
						>
							{name}
						</button>
					))}
				</nav>
				<div className="home-side-rule" />
				<nav aria-label="Registry sources">
					{["my-registry", "spool-registry"].map((name) => (
						<button
							type="button"
							key={name}
							aria-current={collection === name ? "page" : undefined}
							onClick={() => setCollection(name)}
						>
							<span className="home-source-dot" />
							{name}
						</button>
					))}
				</nav>
				<div className="home-side-bottom">
					<button type="button" onClick={actions.openRegistry}>
						Browse registry ↗
					</button>
				</div>
			</aside>
			<div className="home-browser-main">
				<Heading title="Home">
					<Search actions={actions} placeholder="Search everything" />
				</Heading>
				<SectionHeading>Recent projects</SectionHeading>
				<div className="home-browser-recents">
					{actions.visible.slice(0, 3).map((project) => (
						<button type="button" key={project.name} onClick={() => actions.openProject(project)}>
							<ProjectArtwork kind={project.art} />
							<strong>{project.name}</strong>
						</button>
					))}
				</div>
				<SectionHeading>{collection === "Everything" ? "Ready to use" : collection}</SectionHeading>
				<div className="home-browser-items">
					{shown.map((item) => (
						<button
							type="button"
							key={item.name}
							className={cn(selection?.name === item.name && "is-selected")}
							onClick={() => setSelection(item)}
						>
							<span>{item.art === "slack" ? "#" : "◧"}</span>
							<strong>{item.name}</strong>
							<small>{item.kind}</small>
							<Arrow />
						</button>
					))}
					{shown.length === 0 && <p className="home-no-results">No matching items.</p>}
				</div>
			</div>
			<aside className="home-browser-detail">
				{selection && (
					<>
						<ProjectArtwork kind={selection.art} />
						<h2>{selection.name}</h2>
						<p>{selection.description}</p>
						<dl>
							<div>
								<dt>Contains</dt>
								<dd>{selection.count}</dd>
							</div>
							<div>
								<dt>From</dt>
								<dd>{selection.source}</dd>
							</div>
						</dl>
						<Action primary onClick={() => actions.create(selection)}>
							Use in a project
							<Arrow />
						</Action>
						<button type="button" className="home-text-link" onClick={() => actions.inspectItem(selection)}>
							Explore the source
							<Arrow />
						</button>
					</>
				)}
			</aside>
		</div>
	);
}
