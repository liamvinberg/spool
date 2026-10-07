import { cn } from "shared/lib/utils";
import { ProjectIconView } from "./project-icon";

/**
 * "Change icon…" is the Mac's own open panel, dropped as a sheet from the window's top and limited to images. It
 * opens in the project's folder, so a repo's own logo is one click away. Choose copies the file to
 * design/shared/icon.<ext>; the original stays where it was.
 */
export function IconPicker({ project }: { project: string }) {
	const files = [
		{ name: "favicon.ico", kind: "image", picked: false },
		{ name: "logo.svg", kind: "image", picked: true },
		{ name: "og-image.png", kind: "image", picked: false },
		{ name: "receipt-512.png", kind: "image", picked: false },
		{ name: "robots.txt", kind: "text", picked: false },
	];
	return (
		<>
			<div className="absolute inset-x-0 top-11 bottom-0 z-40 bg-[rgba(0,0,0,0.42)]" />
			<div className="-translate-x-1/2 absolute top-11 left-1/2 z-50 flex w-[660px] flex-col overflow-hidden rounded-b-[12px] border border-[#3a3a3a] border-t-0 bg-[#262626] font-sans text-[#e6e6e6] text-[13px] shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
				<div className="flex h-[44px] items-center gap-3 border-[#3a3a3a] border-b px-3">
					<span className="flex gap-[2px] text-[#8a8a8a]">
						<span className="grid h-[24px] w-[24px] place-items-center rounded-[5px]">‹</span>
						<span className="grid h-[24px] w-[24px] place-items-center rounded-[5px]">›</span>
					</span>
					<span className="flex h-[24px] items-center gap-[6px] rounded-[6px] bg-[#333] px-[8px]">
						<Folder />
						public
						<span className="text-[#8a8a8a] text-[10px]">⌃⌄</span>
					</span>
					<span className="ml-auto flex h-[24px] w-[170px] items-center gap-[6px] rounded-[6px] bg-[#333] px-[8px] text-[#8a8a8a]">⌕ Search</span>
				</div>
				<div className="flex h-[300px]">
					<div className="flex w-[150px] shrink-0 flex-col gap-[2px] border-[#3a3a3a] border-r bg-[#2c2c2c] px-[8px] py-[10px]">
						<span className="px-[6px] pb-[4px] font-semibold text-[#8a8a8a] text-[11px]">Favorites</span>
						{["Recents", "Desktop", "Documents", "Downloads", "code"].map((place) => (
							<span key={place} className="flex h-[24px] items-center gap-[7px] rounded-[5px] px-[6px]">
								<Folder />
								{place}
							</span>
						))}
					</div>
					<div className="flex min-w-0 flex-1 flex-col py-[6px]">
						<span className="px-[12px] pb-[4px] font-mono text-[#8a8a8a] text-[11px]">~/code/{project}/public</span>
						{files.map((file) => (
							<span
								key={file.name}
								className={cn(
									"mx-[6px] flex h-[24px] items-center gap-[8px] rounded-[5px] px-[8px]",
									file.picked && "bg-[#0a5fd1] text-white",
									file.kind !== "image" && "text-[#6a6a6a]",
								)}
							>
								<span className={cn("h-[14px] w-[11px] rounded-[2px] border", file.picked ? "border-white/70" : "border-[#7a7a7a]")} />
								{file.name}
							</span>
						))}
					</div>
					<div className="flex w-[200px] shrink-0 flex-col items-center gap-[10px] border-[#3a3a3a] border-l px-[14px] pt-[34px]">
						<ProjectIconView icon={{ from: "file", path: "public/logo.svg", art: "receipt" }} name={project} size={96} />
						<span className="font-medium">logo.svg</span>
						<span className="text-[#8a8a8a] text-[11px]">SVG image · 2 KB</span>
					</div>
				</div>
				<div className="flex h-[52px] items-center gap-[8px] border-[#3a3a3a] border-t px-[14px]">
					<span className="min-w-0 flex-1 text-[#9a9a9a] text-[12px]">
						Square images work best. spool copies it to <span className="font-mono text-[#c8c8c8]">design/shared/icon.svg</span>.
					</span>
					<span className="flex h-[26px] items-center rounded-[6px] bg-[#3a3a3a] px-[14px]">Cancel</span>
					<span className="flex h-[26px] items-center rounded-[6px] bg-[#0a84ff] px-[14px] text-white">Choose</span>
				</div>
			</div>
		</>
	);
}

function Folder() {
	return (
		<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="shrink-0">
			<path d="M1 2.2C1 1.5 1.5 1 2.2 1h3l1.3 1.4h5.3c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2H2.2C1.5 11 1 10.5 1 9.8z" fill="#5aa9f5" />
		</svg>
	);
}
