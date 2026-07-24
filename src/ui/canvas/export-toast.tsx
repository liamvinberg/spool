export interface ExportNotice {
	kind: "progress" | "success" | "error";
	message: string;
}

export function ExportToast({ notice }: { notice: ExportNotice }) {
	return (
		<div
			role={notice.kind === "error" ? "alert" : "status"}
			className="absolute bottom-[120px] left-1/2 z-30 -translate-x-1/2 rounded-md border border-border-raised bg-raised px-3.5 py-2.5 text-base leading-base"
		>
			<span className={notice.kind === "error" ? "text-thread" : "text-text"}>{notice.message}</span>
		</div>
	);
}
