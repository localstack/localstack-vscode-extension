import type { Disposable, LogOutputChannel } from "vscode";

import type {
	ContainerStatus,
	ContainerStatusTracker,
} from "./container-status.ts";
import { createEmitter } from "./emitter.ts";
import { fetchHealth } from "./manage.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type LocalStackStatus = "starting" | "running" | "stopping" | "stopped";

export interface LocalStackStatusTracker extends Disposable {
	status(): LocalStackStatus;
	forceContainerStatus(status: ContainerStatus): void;
	onChange(callback: (status: LocalStackStatus) => void): void;
}

/**
 * Checks the status of the LocalStack instance in realtime.
 */
export function createLocalStackStatusTracker(
	containerStatusTracker: ContainerStatusTracker,
	outputChannel: LogOutputChannel,
	timeTracker: TimeTracker,
): LocalStackStatusTracker {
	let containerStatus: ContainerStatus | undefined;
	let status: LocalStackStatus | undefined;
	const emitter = createEmitter<LocalStackStatus>(outputChannel);

	const healthCheckStatusTracker = createHealthStatusTracker(
		outputChannel,
		timeTracker,
	);

	const setStatus = (newStatus: LocalStackStatus) => {
		if (status !== newStatus) {
			status = newStatus;
			void emitter.emit(status);
		}
	};

	const deriveStatus = () => {
		const newStatus = getLocalStackStatus(
			containerStatus,
			healthCheckStatusTracker.status(),
			status,
		);
		setStatus(newStatus);
	};

	containerStatusTracker.onChange((newContainerStatus) => {
		if (containerStatus !== newContainerStatus) {
			containerStatus = newContainerStatus;
			deriveStatus();
		}
	});

	emitter.on((newStatus) => {
		outputChannel.trace(`[localstack-status] localstack=${newStatus}`);

		if (newStatus === "running") {
			healthCheckStatusTracker.stop();
		}
	});

	containerStatusTracker.onChange((newContainerStatus) => {
		outputChannel.trace(
			`[localstack-status] container=${newContainerStatus} (localstack=${status})`,
		);

		if (newContainerStatus === "running" && status !== "running") {
			healthCheckStatusTracker.start();
		}
	});

	healthCheckStatusTracker.onChange(() => {
		deriveStatus();
	});

	return {
		status() {
			// biome-ignore lint/style/noNonNullAssertion: false positive
			return status!;
		},
		forceContainerStatus(newContainerStatus) {
			if (containerStatus !== newContainerStatus) {
				containerStatus = newContainerStatus;
				deriveStatus();
			}
		},
		onChange(callback) {
			emitter.on(callback);
			if (status) {
				callback(status);
			}
		},
		dispose() {
			healthCheckStatusTracker.dispose();
		},
	};
}

function getLocalStackStatus(
	containerStatus: ContainerStatus | undefined,
	healthStatus: HealthStatus | undefined,
	previousStatus?: LocalStackStatus,
): LocalStackStatus {
	if (containerStatus === "running") {
		if (healthStatus === "healthy") {
			return "running";
		} else {
			// When the LS container is running, and the health check fails:
			// - If the previous status was "running", we are likely stopping LS
			// - If the previous status was "stopping", we are still stopping LS
			if (previousStatus === "running" || previousStatus === "stopping") {
				return "stopping";
			}
			return "starting";
		}
	} else if (containerStatus === "stopping") {
		return "stopping";
	} else {
		return "stopped";
	}
}

type HealthStatus = "healthy" | "unhealthy";

interface HealthStatusTracker extends Disposable {
	status(): HealthStatus | undefined;
	start(): void;
	stop(): void;
	onChange(callback: (status: HealthStatus | undefined) => void): void;
}

function createHealthStatusTracker(
	outputChannel: LogOutputChannel,
	timeTracker: TimeTracker,
): HealthStatusTracker {
	let status: HealthStatus | undefined;
	const emitter = createEmitter<HealthStatus | undefined>(outputChannel);

	let healthCheckTimeout: NodeJS.Timeout | undefined;

	const updateStatus = (newStatus: HealthStatus | undefined) => {
		if (status !== newStatus) {
			status = newStatus;
			void emitter.emit(status);
		}
	};

	const fetchAndUpdateStatus = async () => {
		await timeTracker.run("localstack-status.health", async () => {
			const newStatus = (await fetchHealth()) ? "healthy" : "unhealthy";
			updateStatus(newStatus);
		});
	};

	let enqueueAgain = false;

	const enqueueUpdateStatus = () => {
		if (healthCheckTimeout) {
			return;
		}

		healthCheckTimeout = setTimeout(() => {
			void fetchAndUpdateStatus().then(() => {
				if (!enqueueAgain) {
					return;
				}

				healthCheckTimeout = undefined;
				enqueueUpdateStatus();
			});
		}, 1_000);
	};

	return {
		status() {
			return status;
		},
		start() {
			enqueueAgain = true;
			enqueueUpdateStatus();
		},
		stop() {
			status = undefined;
			enqueueAgain = false;
			clearTimeout(healthCheckTimeout);
			healthCheckTimeout = undefined;
		},
		onChange(callback) {
			emitter.on(callback);
			if (status) {
				callback(status);
			}
		},
		dispose() {
			clearTimeout(healthCheckTimeout);
		},
	};
}
