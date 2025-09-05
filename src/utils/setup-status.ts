import ms from "ms";
import type { Disposable, LogOutputChannel } from "vscode";

import { createEmitter } from "./emitter.ts";
import type { UnwrapPromise } from "./promises.ts";
import { checkSetupStatus } from "./setup.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type SetupStatus = "ok" | "setup_required";

export interface SetupStatusTracker extends Disposable {
	status(): SetupStatus;
	statuses(): UnwrapPromise<ReturnType<typeof checkSetupStatus>>;
	onChange(callback: (status: SetupStatus) => void): void;
}

/**
 * Checks the status of the LocalStack installation.
 */
export async function createSetupStatusTracker(
	outputChannel: LogOutputChannel,
	timeTracker: TimeTracker,
): Promise<SetupStatusTracker> {
	const start = Date.now();
	let statuses: UnwrapPromise<ReturnType<typeof checkSetupStatus>> | undefined;
	let status: SetupStatus | undefined;
	const emitter = createEmitter<SetupStatus>(outputChannel);
	const end = Date.now();
	outputChannel.trace(
		`[setup-status]: Initialized dependencies in ${ms(end - start, { long: true })}`,
	);

	let timeout: NodeJS.Timeout | undefined;
	const startChecking = async () => {
		statuses = await checkSetupStatus(outputChannel);

		const setupRequired = Object.values(statuses).some(
			(check) => check === false,
		);
		const newStatus = setupRequired ? "setup_required" : "ok";
		if (status !== newStatus) {
			status = newStatus;
			await emitter.emit(status);
		}

		// TODO: Find a smarter way to check the status (e.g. watch for changes in AWS credentials or LocalStack installation)
		timeout = setTimeout(() => void startChecking(), 1_000);
	};

	await timeTracker.run("setup-status.checkIsSetupRequired", async () => {
		await startChecking();
	});

	return {
		status() {
			// biome-ignore lint/style/noNonNullAssertion: false positive
			return status!;
		},
		statuses() {
			// biome-ignore lint/style/noNonNullAssertion: false positive
			return statuses!;
		},
		onChange(callback) {
			emitter.on(callback);
			if (status) {
				callback(status);
			}
		},
		dispose() {
			clearTimeout(timeout);
		},
	};
}
