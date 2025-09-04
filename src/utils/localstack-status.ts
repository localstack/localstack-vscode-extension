import type { Disposable, LogOutputChannel } from "vscode";

import type {
	ContainerStatus,
	ContainerStatusTracker,
} from "./container-status.ts";
import { createEmitter } from "./emitter.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type LocalStackStatus = "starting" | "running" | "stopping" | "stopped";

export interface LocalStackStatusTracker extends Disposable {
	status(): LocalStackStatus;
	onChange(callback: (status: LocalStackStatus) => void): void;
}

/**
 * Checks the status of the LocalStack instance in realtime.
 */
export async function createLocalStackStatusTracker(
	containerStatusTracker: ContainerStatusTracker,
	outputChannel: LogOutputChannel,
	timeTracker: TimeTracker,
): Promise<LocalStackStatusTracker> {
	let status: LocalStackStatus | undefined;
	const emitter = createEmitter<LocalStackStatus>(outputChannel);

	let healthCheck: boolean | undefined;

	const updateStatus = () => {
		const newStatus = getLocalStackStatus(
			containerStatusTracker.status(),
			healthCheck,
		);
		if (status !== newStatus) {
			status = newStatus;
			void emitter.emit(status);
		}
	};

	containerStatusTracker.onChange(() => {
		updateStatus();
	});

	let healthCheckTimeout: NodeJS.Timeout | undefined;
	const startHealthCheck = async () => {
		healthCheck = await fetchHealth();
		updateStatus();
		healthCheckTimeout = setTimeout(() => void startHealthCheck(), 1_000);
	};

	await timeTracker.run("healthCheck", async () => {
		await startHealthCheck();
	});

	return {
		status() {
			// biome-ignore lint/style/noNonNullAssertion: false positive
			return status!;
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

function getLocalStackStatus(
	containerStatus: ContainerStatus | undefined,
	healthCheck: boolean | undefined,
): LocalStackStatus {
	if (containerStatus === "running") {
		if (healthCheck === true) {
			return "running";
		} else {
			return "starting";
		}
	} else if (containerStatus === "stopping") {
		return "stopping";
	} else {
		return "stopped";
	}
}

async function fetchHealth(): Promise<boolean> {
	// Abort the fetch if it takes more than 500ms.
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 500);

	try {
		// health is ok in the majority of use cases, however, determining status based on it can be flaky.
		// for example, if localstack becomes unhealthy while running for reasons other that stop then reporting "stopping" may be misleading.
		// though we don't know if it happens often.
		const response = await fetch("http://localhost:4566/_localstack/health", {
			signal: controller.signal,
		});
		return response.ok;
	} catch (err) {
		return false;
	}
}
