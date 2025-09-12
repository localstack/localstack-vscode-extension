import { exec, spawn } from "node:child_process";

import type { Disposable, LogOutputChannel } from "vscode";
import * as z from "zod/v4-mini";

import { createValueEmitter } from "./emitter.ts";
import { JsonLinesStream } from "./json-lines-stream.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type ContainerStatus = "running" | "stopping" | "stopped";

export interface ContainerStatusTracker extends Disposable {
	status(): ContainerStatus | undefined;
	onChange(callback: (status: ContainerStatus | undefined) => void): void;
}

/**
 * Checks the status of a docker container in realtime.
 */
export function createContainerStatusTracker(
	containerName: string,
	outputChannel: LogOutputChannel,
	timeTracker: TimeTracker,
): ContainerStatusTracker {
	const status = createValueEmitter<ContainerStatus>();

	const disposable = listenToContainerStatus(
		containerName,
		outputChannel,
		(newStatus) => {
			status.setValue(newStatus);
		},
	);

	void timeTracker.run("container-status.getContainerStatus", async () => {
		await getContainerStatus(containerName).then((newStatus) => {
			if (status.value() !== undefined) {
				status.setValue(newStatus);
			}
		});
	});

	return {
		status() {
			return status.value();
		},
		onChange(callback) {
			status.onChange(callback);
		},
		dispose() {
			disposable.dispose();
		},
	};
}

const DockerEventsSchema = z.object({
	Action: z.enum(["start", "kill", "die"]),
	Actor: z.object({
		Attributes: z.object({
			name: z.string(),
		}),
	}),
});

function listenToContainerStatus(
	containerName: string,
	outputChannel: LogOutputChannel,
	onStatusChange: (status: ContainerStatus) => void,
): Disposable {
	let dockerEvents: ReturnType<typeof spawn> | undefined;
	let isDisposed = false;
	let restartTimeout: NodeJS.Timeout | undefined;

	const startListening = () => {
		if (isDisposed) return;

		outputChannel.debug(
			"[container-status.listenToContainerStatus] Spawning 'docker events'...",
		);

		try {
			dockerEvents = spawn("docker", [
				"events",
				"--filter",
				`container=${containerName}`,
				"--filter",
				"event=start",
				"--filter",
				"event=kill",
				"--filter",
				"event=die",
				"--format",
				"json",
			]);

			dockerEvents.on("error", (error) => {
				outputChannel.debug(
					`Process 'docker events' errored: ${String(error)}`,
				);

				// Handle docker not installed
				if ("code" in error && error.code === "ENOENT") {
					outputChannel.error(
						"Failed listen to docker container status changes.",
					);
					return;
				}

				// Otherwise, try to restart after a delay
				if (!isDisposed) {
					scheduleRestart();
				}
			});

			dockerEvents.on("close", (code) => {
				outputChannel.debug("Process 'docker events' closed");
				if (!isDisposed && code !== 0) {
					scheduleRestart();
				}
			});

			if (!dockerEvents.stdout) {
				throw new Error("Failed to get stdout from docker events process");
			}

			const jsonlStream = new JsonLinesStream();
			jsonlStream.onJson((json) => {
				const parsed = DockerEventsSchema.safeParse(json);
				if (!parsed.success) {
					return;
				}

				if (parsed.data.Actor.Attributes.name !== containerName) {
					return;
				}

				outputChannel.debug(`[container.status]: ${parsed.data.Action}`);

				switch (parsed.data.Action) {
					case "start":
						onStatusChange("running");
						break;
					case "kill":
						onStatusChange("stopping");
						break;
					case "die":
						onStatusChange("stopped");
						break;
				}
			});

			dockerEvents.stdout.pipe(jsonlStream);
		} catch (error) {
			// If we can't spawn the process, try again after a delay
			scheduleRestart();
		}
	};

	const scheduleRestart = () => {
		if (isDisposed) return;

		// Clear any existing timeout
		clearTimeout(restartTimeout);

		// Try to restart after a delay (exponential backoff would be better in production)
		restartTimeout = setTimeout(() => {
			if (!isDisposed) {
				startListening();
			}
		}, 1_000);
	};

	// Start the initial listener
	startListening();

	return {
		dispose() {
			isDisposed = true;

			if (restartTimeout) {
				clearTimeout(restartTimeout);
			}

			dockerEvents?.kill();
		},
	};
}

async function getContainerStatus(
	containerName: string,
): Promise<ContainerStatus> {
	return new Promise((resolve) => {
		// timeout after 1s
		setTimeout(() => resolve("stopped"), 1_000);

		exec(
			`docker inspect --format {{.State.Status}} ${containerName}`,
			(error, stdout) => {
				if (error) {
					resolve("stopped");
				} else {
					switch (stdout.trim()) {
						case "restarting":
						case "running":
							resolve("running");
							break;
						case "removing":
							resolve("stopping");
							break;
						default:
							resolve("stopped");
							break;
					}
				}
			},
		);
	});
}
