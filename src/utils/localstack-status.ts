import type { Disposable, LogOutputChannel } from "vscode";

import type {
	ContainerStatus,
	ContainerStatusTracker,
} from "./container-status.ts";
import { createValueEmitter } from "./emitter.ts";
import { fetchHealth } from "./manage.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type LocalStackStatus = "starting" | "running" | "stopping" | "stopped";

export interface LocalStackStatusTracker extends Disposable {
	status(): LocalStackStatus | undefined;
	forceContainerStatus(status: ContainerStatus): void;
	onChange(callback: (status: LocalStackStatus | undefined) => void): void;
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
	const status = createValueEmitter<LocalStackStatus>();

	const healthCheckStatusTracker = createHealthStatusTracker(timeTracker);

	const setStatus = (newStatus: LocalStackStatus) => {
		status.setValue(newStatus);
	};

	const deriveStatus = () => {
		const newStatus = getLocalStackStatus(
			containerStatus,
			healthCheckStatusTracker.status(),
			status.value(),
		);
		setStatus(newStatus);
	};

	containerStatusTracker.onChange((newContainerStatus) => {
		if (containerStatus !== newContainerStatus) {
			containerStatus = newContainerStatus;
			deriveStatus();
		}
	});

	status.onChange((newStatus) => {
		outputChannel.trace(`[localstack-status] localstack=${newStatus}`);

		if (newStatus === "running") {
			healthCheckStatusTracker.stop();
		}
	});

	containerStatusTracker.onChange((newContainerStatus) => {
		outputChannel.trace(
			`[localstack-status] container=${newContainerStatus} (localstack=${status.value()})`,
		);

		if (newContainerStatus === "running" && status.value() !== "running") {
			healthCheckStatusTracker.start();
		}
	});

	healthCheckStatusTracker.onChange(() => {
		deriveStatus();
	});

	deriveStatus();

	return {
		status() {
			return status.value();
		},
		forceContainerStatus(newContainerStatus) {
			if (containerStatus !== newContainerStatus) {
				containerStatus = newContainerStatus;
				deriveStatus();
			}
		},
		onChange(callback) {
			status.onChange(callback);
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
	timeTracker: TimeTracker,
): HealthStatusTracker {
	const status = createValueEmitter<HealthStatus | undefined>();

	let healthCheckTimeout: NodeJS.Timeout | undefined;

	const updateStatus = (newStatus: HealthStatus | undefined) => {
		status.setValue(newStatus);
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
			return status.value();
		},
		start() {
			enqueueAgain = true;
			enqueueUpdateStatus();
		},
		stop() {
			status.setValue(undefined);
			enqueueAgain = false;
			clearTimeout(healthCheckTimeout);
			healthCheckTimeout = undefined;
		},
		onChange(callback) {
			status.onChange(callback);
		},
		dispose() {
			clearTimeout(healthCheckTimeout);
		},
	};
}
