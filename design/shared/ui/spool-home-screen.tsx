import { cn } from "../lib/utils";
import { SpoolShell } from "./spool-shell";

const projects = [
	{ name: "kaffe", count: "8 frames · today", path: "~/projects/kaffe", thumb: "circle" },
	{ name: "tretolv", count: "23 frames · 2 days ago", path: "~/projects/tretolv", thumb: "square" },
	{ name: "droneit", count: "12 frames · last week", path: "~/projects/droneit", thumb: "button" },
] as const;

interface SpoolHomeScreenProps {
	canvasTarget?: string;
}

export function SpoolHomeScreen({ canvasTarget }: SpoolHomeScreenProps) {
	return (
		<SpoolShell showCanvasControls={false} tabs={["kaffe", "tretolv"]}>
			<div className="flex h-full flex-col gap-6 bg-bg px-16 py-12">
				<div className="flex w-full items-baseline justify-between">
					<h1 className="font-semibold text-lg tracking-tight leading-lg">Projects</h1>
					<span className="font-mono text-muted text-xs leading-[14px]">3 registered</span>
				</div>
				<div className="flex gap-6">
					{projects.map((project, index) => (
						<button
							key={project.name}
							type="button"
							data-go={index === 0 ? canvasTarget : undefined}
							className="flex w-[421px] shrink-0 flex-col gap-3.5 rounded-lg border border-border bg-surface p-4 text-left"
						>
							<div className="flex gap-2.5">
								<Thumbnail kind="menu" tall={index === 2} />
								<Thumbnail kind="cart" tall={index === 1} />
								<Thumbnail kind={project.thumb} />
							</div>
							<div className="flex flex-col gap-[3px]">
								<div className="flex items-baseline justify-between">
									<span className="font-semibold text-md tracking-tight leading-sm">{project.name}</span>
									<span className="font-mono text-muted text-xs leading-[14px]">{project.count}</span>
								</div>
								<span className="font-mono text-muted text-xs leading-[14px]">{project.path}</span>
							</div>
						</button>
					))}
				</div>
			</div>
		</SpoolShell>
	);
}

function Thumbnail({ kind, tall = false }: { kind: string; tall?: boolean }) {
	return (
		<div className="flex h-[150px] w-[123px] shrink-0 flex-col overflow-hidden rounded-md border border-[#E4E4E7] bg-[#FEFEFE] p-2 text-[#17171A]">
			{kind === "menu" ? (
				<div className="flex flex-col gap-1.5">
					<span className="h-[7px] w-11 rounded-[2px] bg-[#17171A]" />
					<span className={cn("w-full rounded-xs bg-[#EFEFF1]", tall ? "h-8" : "h-[18px]")} />
					<span className="h-[18px] w-full rounded-xs bg-[#EFEFF1]" />
					<span className="h-[18px] w-full rounded-xs bg-[#EFEFF1]" />
				</div>
			) : kind === "cart" ? (
				<div className="flex flex-col gap-1.5">
					<span className="h-[7px] w-[60px] rounded-[2px] bg-[#17171A]" />
					<span className={cn("w-full rounded-xs bg-[#EFEFF1]", tall ? "h-10" : "h-6")} />
					<span className="h-6 w-full rounded-xs bg-[#EFEFF1]" />
				</div>
			) : (
				<div className="flex h-full flex-col items-center justify-center gap-1.5">
					<span
						className={cn(
							"bg-[#17171A]",
							kind === "circle"
								? "h-7 w-7 rounded-full"
								: kind === "square"
									? "h-10 w-10 rounded-md"
									: "h-3.5 w-[52px] rounded-xs",
						)}
					/>
					<span
						className={cn("h-[7px] rounded-[2px] bg-[#EFEFF1]", kind === "button" ? "w-[70px]" : "w-[52px]")}
					/>
				</div>
			)}
		</div>
	);
}
