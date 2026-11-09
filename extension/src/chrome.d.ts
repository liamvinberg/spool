/**
 * The few extension APIs spool's extension calls, as Chrome documents them. Declared here rather than taken from
 * `@types/chrome`, which would bring the whole platform for a dozen calls.
 */
declare namespace chrome {
	namespace runtime {
		const id: string;
		const lastError: { message?: string } | undefined;
		interface MessageSender {
			tab?: tabs.Tab;
		}
		function sendMessage<T = unknown>(message: unknown): Promise<T>;
		const onMessage: {
			addListener(
				listener: (
					message: unknown,
					sender: MessageSender,
					respond: (answer: unknown) => void,
				) => boolean | undefined,
			): void;
		};
	}
	namespace tabs {
		interface Tab {
			id?: number;
			url?: string;
			windowId?: number;
		}
		function create(options: { url: string; active?: boolean }): Promise<Tab>;
		function query(filter: { url?: string }): Promise<Tab[]>;
		/** what the window's visible tab shows, as a data URL; `activeTab` allows it once the picker is opened */
		function captureVisibleTab(windowId: number | undefined, options: { format: "png" }): Promise<string>;
	}
	namespace action {
		const onClicked: { addListener(listener: (tab: tabs.Tab) => void): void };
	}
	namespace scripting {
		interface Injection<T> {
			target: { tabId: number };
			files?: string[];
			func?: () => T;
		}
		function executeScript<T>(injection: Injection<T>): Promise<{ result?: T }[]>;
	}
	namespace storage {
		const local: {
			get(keys: string | string[]): Promise<Record<string, unknown>>;
			set(items: Record<string, unknown>): Promise<void>;
		};
	}
	namespace dom {
		function openOrClosedShadowRoot(element: HTMLElement): ShadowRoot | null;
	}
}
