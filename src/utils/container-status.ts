import { exec, spawn } from "node:child_process";

import type { Disposable, LogOutputChannel } from "vscode";
import * as z from "zod/v4-mini";

import { createEmitter } from "./emitter.ts";

export type ContainerStatus = "running" | "stopping" | "stopped";

export interface ContainerStatusTracker extends Disposable {
	status(): ContainerStatus;
	onChange(callback: (status: ContainerStatus) => void): void;
}

/**
 * Checks the status of a docker container in realtime.
 */
export async function createContainerStatusTracker(
	containerName: string,
	outputChannel: LogOutputChannel,
): Promise<ContainerStatusTracker> {
	let status: ContainerStatus | undefined;
	const emitter = createEmitter<ContainerStatus>(outputChannel);

	const disposable = listenToContainerStatus(
		containerName,
		outputChannel,
		(newStatus) => {
			if (status !== newStatus) {
				status = newStatus;
				void emitter.emit(status);
			}
		},
	);

	await getContainerStatus(containerName).then((newStatus) => {
		status ??= newStatus;
		void emitter.emit(status);
	});

	return {
		status() {
			return status!;
		},
		onChange(callback) {
			emitter.on(callback);
			if (status) {
				callback(status);
			}
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

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

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

		outputChannel.debug("Spawning 'docker events'...");

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

			let buffer = "";
			dockerEvents.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();

				// Process all complete lines
				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.substring(0, newlineIndex).trim();
					buffer = buffer.substring(newlineIndex + 1);

					const json = safeJsonParse(line);
					const parsed = DockerEventsSchema.safeParse(json);
					if (!parsed.success) {
						continue;
					}

					if (parsed.data.Actor.Attributes.name !== containerName) {
						continue;
					}

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

					newlineIndex = buffer.indexOf("\n");
				}
			});
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
		exec(
			`docker inspect --format {{.State.Status}} ${containerName}`,
			(error, stdout) => {
				if (error) {
					resolve("stopped");
				} else {
					switch (stdout.trim()) {
						case "created":
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
