import { cn } from "shared/lib/utils";
// Verbatim option from the shipped frame export dialog.
export function FormatOption({
	checked,
	description,
	disabled,
	label,
	onClick,
}: {
	checked: boolean;
	description: string;
	disabled: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<label
			className={cn(
				"flex items-center gap-3 rounded-md border px-3 py-2.5 text-left",
				checked ? "border-thread bg-surface" : "border-transparent",
				disabled ? "cursor-default opacity-60" : "cursor-pointer",
			)}
		>
			<input
				type="radio"
				name="export-format"
				checked={checked}
				disabled={disabled}
				className="sr-only"
				onChange={onClick}
			/>
			<span
				className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
					checked ? "border-thread" : "border-muted",
				)}
			>
				{checked ? <span className="h-2 w-2 rounded-full bg-thread" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="type-control">{label}</span>
				<span className="text-muted type-label">{description}</span>
			</span>
		</label>
	);
}
