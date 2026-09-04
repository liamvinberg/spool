import { cn } from "shared/lib/utils";

/**
 * The two controls a settings surface needs and spool has never drawn: a switch
 * and a field.
 *
 * Both are built on the chrome's own tokens rather than on values of their own,
 * so a colour changed under Customize changes them while you are looking at
 * them. That is the point of the Theme tab and it has to be true of the controls
 * standing on it.
 */

export function Switch({
	on,
	label,
	onChange,
}: {
	on: boolean;
	label: string;
	onChange?: ((next: boolean) => void) | undefined;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			onClick={() => onChange?.(!on)}
			className={cn(
				"flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-150",
				on ? "border-thread bg-thread" : "border-border-raised bg-raised hover:border-muted/50",
			)}
		>
			<span
				className={cn(
					"h-2.5 w-2.5 rounded-full transition-[translate,background-color] duration-150 ease-out",
					on ? "translate-x-[14px] bg-on-thread" : "translate-x-[2px] bg-muted",
				)}
			/>
		</button>
	);
}

/**
 * A field for something the machine would print: a host, a port, a hex. Mono at
 * full ink, because the value is the machine's own spelling and the label beside
 * it is the sentence.
 */
export function Field({
	value,
	label,
	width,
	editing = false,
	onChange,
}: {
	value: string;
	label: string;
	width: number;
	/** the field the caret is in, drawn as it looks while somebody is typing */
	editing?: boolean | undefined;
	onChange?: ((next: string) => void) | undefined;
}) {
	return (
		<span
			className={cn(
				"flex h-7 shrink-0 items-center rounded-sm border bg-canvas px-2.5 transition-colors duration-150",
				editing ? "border-thread" : "border-border hover:border-border-raised focus-within:border-border-raised",
			)}
			style={{ width }}
		>
			<input
				type="text"
				value={value}
				aria-label={label}
				spellCheck={false}
				onChange={(event) => onChange?.(event.target.value)}
				className="w-full bg-transparent font-mono text-text text-xs leading-xs outline-none"
			/>
			{editing ? <Caret /> : null}
		</span>
	);
}

/** The caret, drawn rather than focused, so a still of a mid-edit field has one. */
function Caret() {
	return <span className="-ml-px h-3.5 w-px shrink-0 bg-thread" />;
}
