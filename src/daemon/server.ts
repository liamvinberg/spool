import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { SpoolError } from "../errors";
import { createDaemonApp } from "./app";
import { clearDaemonState, daemonUrl, writeDaemonState } from "./lifecycle";

export interface ServeDaemonOptions {
	spoolDir: string;
	version: string;
	host: string;
	port: number;
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
export function serveDaemon({ spoolDir, version, host, port }: ServeDaemonOptions): Promise<RunningDaemon> {
	const daemon = createDaemonApp({ spoolDir, version });

	return new Promise<RunningDaemon>((resolve, reject) => {
		const server = serve({ fetch: daemon.app.fetch, hostname: host, port }, (info: AddressInfo) => {
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
					}),
			});
		});
		server.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				reject(new SpoolError(`port ${port} on ${host} is already in use — is another spool daemon serving?`));
			} else {
				reject(new SpoolError(`cannot bind ${host}:${port}: ${error.message}`));
			}
		});
	});
}
