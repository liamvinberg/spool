import { join } from "node:path";
import { type BrowserWindow, WebContentsView } from "electron";
import { mountFold } from "./fold-renderer";

/** A local surface survives a daemon reload; its lifetime belongs to the window. */
export class UpdateCover {
	private readonly view = new WebContentsView({
		webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
	});
	private closed = false;
	private readonly loaded: Promise<void>;
	private readonly resize = () => {
		const [width = 1, height = 1] = this.owner.getContentSize();
		this.view.setBounds({ x: 0, y: 0, width, height });
	};
	constructor(
		private readonly owner: BrowserWindow,
		covered = false,
	) {
		this.view.setBackgroundColor(covered ? "#0e0e0e" : "#00000000");
		this.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		this.view.webContents.on("will-navigate", (event) => event.preventDefault());
		owner.contentView.addChildView(this.view);
		owner.on("resize", this.resize);
		owner.once("closed", this.close);
		this.resize();
		this.loaded = this.view.webContents
			.loadFile(join(__dirname, "../assets/update-cover.html"))
			.then(() => this.view.webContents.executeJavaScript(`(${mountFold.toString()})(${covered})`))
			.then(() => {
				if (!this.closed) {
					this.view.setBackgroundColor("#00000000");
					this.view.webContents.focus();
				}
			});
		void this.loaded.catch(() => this.close());
	}
	private async animate(direction: "enter" | "reveal"): Promise<void> {
		let deadline: NodeJS.Timeout | undefined;
		try {
			await Promise.race([
				this.loaded.then(async () => {
					if (!this.closed) await this.view.webContents.executeJavaScript(`window.fold.${direction}()`);
				}),
				new Promise<never>((_, reject) => {
					deadline = setTimeout(() => reject(new Error("The update cover did not respond.")), 5000);
				}),
			]);
		} finally {
			clearTimeout(deadline);
		}
	}
	async enter(): Promise<void> {
		await this.animate("enter");
	}
	async reveal(): Promise<void> {
		try {
			await this.animate("reveal");
		} finally {
			this.close();
		}
	}
	readonly close = (): void => {
		if (this.closed) return;
		this.closed = true;
		this.owner.removeListener("resize", this.resize);
		this.owner.removeListener("closed", this.close);
		if (!this.owner.isDestroyed()) {
			this.owner.contentView.removeChildView(this.view);
			this.owner.webContents.focus();
		}
		if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
	};
}
