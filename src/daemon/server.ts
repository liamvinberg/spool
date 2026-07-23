import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { PortBusyError, SpoolError } from "../errors";
import { createDaemonApp } from "./app";
import { clearDaemonState, daemonUrl, writeDaemonState } from "./lifecycle";
import type { TermExecutor } from "./term-exec";

export interface ServeDaemonOptions {
	spoolDir: string;
	version: string;
	host: string;
	port: number;
	uiDir?: string | undefined;
	development?: boolean | undefined;
	/** #30 phone-home — absent means off, so tests and tools stay silent. */
	updateCheck?: boolean | undefined;
	/** The PTY spawn (#42) — seam tests inject a fixture. */
	termExecutor?: TermExecutor | undefined;
}

export interface RunningDaemon {
	url: string;
	host: string;
	port: number;
	close(): Promise<void>;
}

/**
 * Bind the daemon and record it in daemon.json — written only after a
 * successful listen, so a losing racer never clobbers the winner's state.
 */
export function serveDaemon({
	spoolDir,
	version,
	host,
	port,
	uiDir,
	development,
	updateCheck,
	termExecutor,
}: ServeDaemonOptions): Promise<RunningDaemon> {
	const daemon = createDaemonApp({
		spoolDir,
		version,
		uiDir,
		development,
		updateCheck,
		...(termExecutor === undefined ? {} : { termExecutor }),
	});

	return new Promise<RunningDaemon>((resolve, reject) => {
		const server = serve({ fetch: daemon.app.fetch, hostname: host, port, createServer }, (info: AddressInfo) => {
			// spool's first WebSocket (#42): terminal frames attach on /term/…
			server.on("upgrade", daemon.handleUpgrade);
			// bound: the daemon can now dial itself (the thumb healer's shots)
			daemon.setSelfOrigin(daemonUrl(host, info.port));
			// listening first, asking after — the registry never delays the canvas
			daemon.startUpdateCheck();
			writeDaemonState(spoolDir, {
				pid: process.pid,
				host,
				port: info.port,
				version,
				startedAt: new Date().toISOString(),
			});
			resolve({
				url: daemonUrl(host, info.port),
				host: info.address,
				port: info.port,
				close: () =>
					new Promise<void>((done) => {
						daemon.close();
						clearDaemonState(spoolDir, process.pid);
						server.close(() => done());
						server.closeAllConnections();
					}),
			});
		}) as Server;
		server.on("error", (error: NodeJS.ErrnoException) => {
			// the app was already constructed — release its watchers and timers
			// or the failed process never drains its event loop
			daemon.close();
			if (error.code === "EADDRINUSE") {
				reject(new PortBusyError(`port ${port} on ${host} is already in use — is another spool daemon serving?`));
			} else {
				reject(new SpoolError(`cannot bind ${host}:${port}: ${error.message}`));
			}
		});
	});
}
