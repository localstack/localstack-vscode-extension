import { watch } from "chokidar";
import ms from "ms";
import type { Disposable, LogOutputChannel } from "vscode";

import {
	checkIsAuthenticated,
	LOCALSTACK_AUTH_FILENAME,
} from "./authenticate.ts";
import {
	AWS_CONFIG_FILENAME,
	AWS_CREDENTIALS_FILENAME,
	checkIsProfileConfigured,
} from "./configure-aws.ts";
import { createEmitter } from "./emitter.ts";
import { immediateOnce } from "./immediate-once.ts";
import { checkIsLicenseValid, LICENSE_FILENAME } from "./license.ts";
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
	const awsProfileTracker = createAwsProfileStatusTracker(outputChannel);
	const localStackAuthenticationTracker =
		createLocalStackAuthenticationStatusTracker(outputChannel);
	const licenseTracker = createLicenseStatusTracker(outputChannel);
	const end = Date.now();
	outputChannel.trace(
		`[setup-status]: Initialized dependencies in ${ms(end - start, { long: true })}`,
	);

	const checkStatusNow = async () => {
		const allStatusesInitialized = Object.values({
			awsProfileTracker: awsProfileTracker.status(),
			authTracker: localStackAuthenticationTracker.status(),
			licenseTracker: licenseTracker.status(),
		}).every((check) => check !== undefined);

		if (!allStatusesInitialized) {
			outputChannel.trace(
				`[setup-status] File watchers not initialized yet, skipping status check : ${JSON.stringify(
					{
						awsProfileTracker: awsProfileTracker.status() ?? "undefined",
						authTracker:
							localStackAuthenticationTracker.status() ?? "undefined",
						licenseTracker: licenseTracker.status() ?? "undefined",
					},
				)}`,
			);
			return;
		}

		statuses = await checkSetupStatus(outputChannel);

		const setupRequired = [
			...Object.values(statuses),
			awsProfileTracker.status() === "ok",
			localStackAuthenticationTracker.status() === "ok",
			licenseTracker.status() === "ok",
		].some((check) => check === false);

		const newStatus = setupRequired ? "setup_required" : "ok";
		if (status !== newStatus) {
			status = newStatus;
			outputChannel.trace(
				`[setup-status] Status changed to ${JSON.stringify({
					...statuses,
					awsProfileTracker: awsProfileTracker.status() ?? "undefined",
					authTracker: localStackAuthenticationTracker.status() ?? "undefined",
					licenseTracker: licenseTracker.status() ?? "undefined",
				})}`,
			);
			await emitter.emit(status);
		}
	};

	const checkStatus = immediateOnce(async () => {
		await checkStatusNow();
	});

	awsProfileTracker.onChange(() => {
		checkStatus();
	});

	localStackAuthenticationTracker.onChange(() => {
		checkStatus();
	});

	licenseTracker.onChange(() => {
		checkStatus();
	});

	let timeout: NodeJS.Timeout | undefined;
	const startChecking = () => {
		checkStatus();

		// TODO: Find a smarter way to check the status (e.g. watch for changes in AWS credentials or LocalStack installation)
		timeout = setTimeout(() => void startChecking(), 1_000);
	};

	await timeTracker.run("setup-status.checkIsSetupRequired", () => {
		startChecking();
		return Promise.resolve();
	});

	await checkStatusNow();

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
		async dispose() {
			clearTimeout(timeout);
			await Promise.all([
				awsProfileTracker.dispose(),
				localStackAuthenticationTracker.dispose(),
			]);
		},
	};
}

interface StatusTracker {
	status(): SetupStatus | undefined;
	onChange(callback: (status: SetupStatus) => void): void;
	dispose(): Promise<void>;
}

/**
 * Creates a status tracker that monitors the given files for changes.
 * When a file is added, changed, or deleted, the provided check function is called
 * to determine the current setup status. Emits status changes to registered listeners.
 *
 * @param outputChannel - Channel for logging output and trace messages.
 * @param outputChannelPrefix - Prefix for log messages.
 * @param files - Array of file paths to watch.
 * @param check - Function that returns the current SetupStatus (sync or async).
 * @returns A {@link StatusTracker} instance for querying status, subscribing to changes, and disposing resources.
 */
function createFileStatusTracker(
	outputChannel: LogOutputChannel,
	outputChannelPrefix: string,
	files: string[],
	check: () => Promise<SetupStatus> | SetupStatus,
): StatusTracker {
	let status: SetupStatus | undefined;

	const emitter = createEmitter<SetupStatus>(outputChannel);

	const updateStatus = immediateOnce(async () => {
		const newStatus = await Promise.resolve(check());
		if (status !== newStatus) {
			status = newStatus;
			outputChannel.trace(
				`${outputChannelPrefix} File status changed to ${status}`,
			);
			await emitter.emit(status);
		}
	});

	const watcher = watch(files)
		.on("change", (path) => {
			outputChannel.trace(`${outputChannelPrefix} ${path} changed`);
			updateStatus();
		})
		.on("unlink", (path) => {
			outputChannel.trace(`${outputChannelPrefix} ${path} deleted`);
			updateStatus();
		})
		.on("add", (path) => {
			outputChannel.trace(`${outputChannelPrefix} ${path} added`);
			updateStatus();
		})
		.on("error", (error) => {
			outputChannel.error(`${outputChannelPrefix} Error watching file`);
			outputChannel.error(error instanceof Error ? error : String(error));
		});

	// Update the status immediately on file tracker initialization
	void updateStatus();

	return {
		status() {
			return status;
		},
		onChange(callback) {
			emitter.on(callback);
			if (status) {
				callback(status);
			}
		},
		async dispose() {
			await watcher.close();
		},
	};
}

/**
 * Creates a status tracker that monitors the AWS profile files for changes.
 * When the file is changed, the provided check function is called to determine the current setup status.
 * Emits status changes to registered listeners.
 *
 * @param outputChannel - Channel for logging output and trace messages.
 * @returns A {@link StatusTracker} instance for querying status, subscribing to changes, and disposing resources.
 */
function createAwsProfileStatusTracker(
	outputChannel: LogOutputChannel,
): StatusTracker {
	return createFileStatusTracker(
		outputChannel,
		"[setup-status.aws-profile]",
		[AWS_CONFIG_FILENAME, AWS_CREDENTIALS_FILENAME],
		async () => ((await checkIsProfileConfigured()) ? "ok" : "setup_required"),
	);
}

/**
 * Creates a status tracker that monitors the LocalStack authentication file for changes.
 * When the file is changed, the provided check function is called to determine the current setup status.
 * Emits status changes to registered listeners.
 *
 * @param outputChannel - Channel for logging output and trace messages.
 * @param outputChannel
 * @returns A {@link StatusTracker} instance for querying status, subscribing to changes, and disposing resources.
 */
function createLocalStackAuthenticationStatusTracker(
	outputChannel: LogOutputChannel,
): StatusTracker {
	return createFileStatusTracker(
		outputChannel,
		"[setup-status.localstack-authentication]",
		[LOCALSTACK_AUTH_FILENAME],
		async () => ((await checkIsAuthenticated()) ? "ok" : "setup_required"),
	);
}

/**
 * Creates a status tracker that monitors the LocalStack license file for changes.
 * When the file is changed, the provided check function is called to determine the current setup status.
 * Emits status changes to registered listeners.
 *
 * @param outputChannel - Channel for logging output and trace messages.
 * @returns A {@link StatusTracker} instance for querying status, subscribing to changes, and disposing resources.
 */
function createLicenseStatusTracker(
	outputChannel: LogOutputChannel,
): StatusTracker {
	return createFileStatusTracker(
		outputChannel,
		"[setup-status.license]",
		[LOCALSTACK_AUTH_FILENAME, LICENSE_FILENAME], //TODO rewrite to depend on change in localStackAuthenticationTracker
		async () =>
			(await checkIsLicenseValid(outputChannel)) ? "ok" : "setup_required",
	);
}
