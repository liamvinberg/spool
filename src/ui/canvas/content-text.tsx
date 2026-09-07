import { useRef, useState } from "react";
import type { SourceRead } from "../../source-edit";
import { BOX, Row, Section, VALUE } from "./properties-fields";

export interface TextActions {
	begin(frame: string, selector: string): Promise<SourceRead | undefined>;
	preview(frame: string, read: SourceRead, text: string): void;
	finish(frame: string, read: SourceRead, text: string, commit: boolean): void;
}

/** Native field input and inline input own the same original source read. */
export function ContentText({
	frame,
	selector,
	html,
	actions,
}: {
	frame: string;
	selector: string;
	html: string;
	actions: TextActions;
}) {
	const initial = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
	const [text, setText] = useState(initial);
	const session = useRef<{
		reading: Promise<SourceRead | undefined>;
		text: string;
		done: boolean;
		dirty: boolean;
		composing: boolean;
		finish: boolean;
	} | null>(null);
	const end = (commit: boolean) => {
		const held = session.current;
		if (!held || held.done) return;
		if (commit && held.composing) {
			held.finish = true;
			return;
		}
		held.done = true;
		void held.reading.then((read) => {
			if (read) actions.finish(frame, read, held.text, commit);
			if (!commit) setText(read?.value ?? initial);
		});
	};
	return (
		<Section name="Content" reason="this use">
			<Row name="Text" tall>
				<label className={`block min-w-0 flex-1 px-1 ${BOX} ${VALUE}`}>
					<textarea
						aria-label="Text"
						value={text}
						rows={3}
						className="block w-full resize-none bg-transparent py-1 text-text outline-none"
						onFocus={() => {
							const held = {
								reading: actions.begin(frame, selector),
								text,
								done: false,
								dirty: false,
								composing: false,
								finish: false,
							};
							session.current = held;
							void held.reading.then((read) => {
								if (!read) return;
								if (!held.dirty) {
									held.text = read.value;
									setText(read.value);
								} else if (!held.done) actions.preview(frame, read, held.text);
							});
						}}
						onChange={(event) => {
							const next = event.target.value;
							setText(next);
							const held = session.current;
							if (!held || held.done) return;
							held.dirty = true;
							held.text = next;
							void held.reading.then((read) => {
								if (read && !held.done) actions.preview(frame, read, held.text);
							});
						}}
						onCompositionStart={() => {
							if (session.current) session.current.composing = true;
						}}
						onCompositionEnd={() => {
							const held = session.current;
							if (!held) return;
							held.composing = false;
							if (held.finish) setTimeout(() => end(true), 0);
						}}
						onBlur={() => end(true)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								end(false);
								event.currentTarget.blur();
							}
							if (
								event.key === "Enter" &&
								!event.shiftKey &&
								!event.nativeEvent.isComposing &&
								!session.current?.composing
							) {
								event.preventDefault();
								end(true);
								event.currentTarget.blur();
							}
						}}
					/>
				</label>
			</Row>
		</Section>
	);
}
