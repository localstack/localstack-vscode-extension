import ms from "ms";
import type { Disposable, LogOutputChannel } from "vscode";

import { createEmitter } from "./emitter.ts";
import { checkIsSetupRequired } from "./setup.ts";
import type { TimeTracker } from "./time-tracker.ts";

export type SetupStatus = "ok" | "setup_required";

export interface SetupStatusTracker extends Disposable {
	status(): SetupStatus;
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
	let status: SetupStatus | undefined;
	const emitter = createEmitter<SetupStatus>(outputChannel);
	const end = Date.now();
	outputChannel.trace(
		`[setup-status-tracker]: Initialized dependencies in ${ms(end - start, { long: true })}`,
	);

	let timeout: NodeJS.Timeout | undefined;
	const startChecking = async () => {
		const setupRequired = await checkIsSetupRequired(outputChannel);
		const newStatus = setupRequired ? "setup_required" : "ok";
		if (status !== newStatus) {
			status = newStatus;
			await emitter.emit(status);
		}

		timeout = setTimeout(() => void startChecking(), 1_000);
	};

	await timeTracker.run(
		"setup-status-tracker.checkIsSetupRequired",
		async () => {
			await startChecking();
		},
	);

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
			clearTimeout(timeout);
		},
	};
}
