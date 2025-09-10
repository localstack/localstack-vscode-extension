import EventEmitter from "node:events";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { watch } from "chokidar";
import { workspace } from "vscode";
import type { CancellationToken, LogOutputChannel, Disposable } from "vscode";

import { CLI_PATHS, LOCALSTACK_DOCKER_IMAGE_NAME } from "../constants.ts";

import { createEmitter, createValueEmitter } from "./emitter.ts";
import type { Callback } from "./emitter.ts";
import { exec } from "./exec.ts";
import { immediateOnce } from "./immediate-once.ts";
import { setIntervalPromise } from "./promises.ts";
import type { SetupStatus } from "./setup-status.ts";
import { spawn } from "./spawn.ts";
import type { SpawnOptions } from "./spawn.ts";

const IMAGE_NAME = LOCALSTACK_DOCKER_IMAGE_NAME; // not using the import directly as the constant name should match the env var
const LOCALSTACK_LDM_PREVIEW = "1";

async function getLocalStackVersion(
	cliPath: string,
): Promise<string | undefined> {
	try {
		const { stdout } = await exec([cliPath, "--version"].join(" "), {
			env: {
				...process.env,
				IMAGE_NAME,
				LOCALSTACK_LDM_PREVIEW,
			},
		});

		const versionMatch = stdout.match(/\b([\d]+\.[\d]+.(?:\d[\d\w]*))\b/);
		if (!versionMatch) {
			return undefined;
		}
		const [, stdoutVersion] = versionMatch;
		return stdoutVersion;
	} catch {
		return undefined;
	}
}

async function getLocalStackMajorVersion(
	cliPath: string,
): Promise<number | undefined> {
	const version = await getLocalStackVersion(cliPath);
	if (!version) {
		return undefined;
	}
	const majorVersionMatch = version.match(/^(\d+)\./);
	if (!majorVersionMatch) {
		return undefined;
	}
	const [, majorVersionStr] = majorVersionMatch;
	const majorVersion = parseInt(majorVersionStr, 10);
	if (Number.isNaN(majorVersion)) {
		return undefined;
	}
	return majorVersion;
}

async function verifyLocalStackCli(cliPath: string) {
	const [found, executable, version] = await Promise.all([
		access(cliPath, constants.F_OK)
			.then(() => true)
			.catch(() => false),
		access(cliPath, constants.X_OK)
			.then(() => true)
			.catch(() => false),
		getLocalStackMajorVersion(cliPath),
	]);
	return {
		found,
		executable,
		upToDate: version !== undefined ? version >= 4 : undefined,
	};
}

interface CliCheckResult {
	cliPath: string | undefined;
	found: boolean;
	executable: boolean | undefined;
	upToDate: boolean | undefined;
}

async function findLocalStack(): Promise<CliCheckResult> {
	// Check if a custom path is configured
	const config = workspace.getConfiguration("localstack");
	const customLocation = config.get<string | null>("cli.location");
	if (customLocation) {
		const { found, executable, upToDate } =
			await verifyLocalStackCli(customLocation);
		return {
			cliPath: customLocation,
			found,
			executable,
			upToDate,
		};
		// const {found, executable, upToDate} = await verifyLocalStackCli(customLocation);
		// if (!found) {
		// 	throw new Error(`Configured LocalStack CLI location '${customLocation}' does not exist`);
		// }
		// if (!executable) {
		// 	throw new Error(`Configured LocalStack CLI location '${customLocation}' is not executable`);
		// }
		// if (!upToDate) {
		// 	throw new Error(`Configured LocalStack CLI location '${customLocation}' is outdated (version < 4)`);
		// }
	}

	// Fall back to default search paths
	for (const CLI_PATH of CLI_PATHS) {
		const { found, executable, upToDate } = await verifyLocalStackCli(CLI_PATH);
		if (found) {
			return {
				cliPath: CLI_PATH,
				found,
				executable,
				upToDate,
			};
		}
	}

	return {
		cliPath: undefined,
		found: false,
		executable: undefined,
		upToDate: undefined,
	};
}

export const execLocalStack = async (
	cliPath: string,
	args: string[],
	options?: {
		outputChannel: LogOutputChannel;
	},
) => {
	const response = await exec([cliPath, ...args].join(" "), {
		env: {
			...process.env,
			IMAGE_NAME,
			LOCALSTACK_LDM_PREVIEW,
		},
	});
	return response;
};

export const spawnLocalStack = async (
	cliPath: string,
	args: string[],
	options: {
		outputChannel: LogOutputChannel;
		cancellationToken?: CancellationToken;
		onStderr?: SpawnOptions["onStderr"];
	},
) => {
	return spawn(cliPath, args, {
		outputChannel: options.outputChannel,
		outputLabel: `localstack.${args[0]}`,
		cancellationToken: options.cancellationToken,
		environment: {
			...process.env,
			IMAGE_NAME,
			LOCALSTACK_LDM_PREVIEW,
		},
		onStderr: options.onStderr,
	});
};

export type LocalStackCliStatus = "not_found" | "outdated" | "ok";

export interface LocalStackCliTracker extends Disposable {
	// setupStatus(): SetupStatus | undefined;
	// onSetupStatusChange(
	// 	callback: (status: SetupStatus | undefined) => void,
	// ): void;
	// cli(): CliCheckResult | undefined;
	// onCliChange(callback: (cli: CliCheckResult | undefined) => void): void;
	// cliStatus(): LocalStackCliStatus | undefined;
	// onCliStatusChange(callback: (status: LocalStackCliStatus) => void): void;

	status(): SetupStatus | undefined;
	onStatusChange(callback: (status: SetupStatus | undefined) => void): void;
	cliPath(): string | undefined;
	onCliPathChange(callback: (cliPath: string | undefined) => void): void;
}

function areCliCheckResultsDifferent(
	resultA: CliCheckResult | undefined,
	resultB: CliCheckResult | undefined,
): boolean {
	if (resultA?.cliPath !== resultB?.cliPath) {
		return true;
	}
	if (resultA?.found !== resultB?.found) {
		return true;
	}
	if (resultA?.executable !== resultB?.executable) {
		return true;
	}
	return false;
}

function statusFromCliCheckResult(
	cli: CliCheckResult | undefined,
): LocalStackCliStatus {
	if (!cli?.found || !cli.executable) {
		return "not_found";
	}
	if (cli.upToDate === false) {
		return "outdated";
	}
	return "ok";
}

export function createCliStatusTracker(
	outputChannel: LogOutputChannel,
): LocalStackCliTracker {
	// const emitter = new EventEmitter<{
	// 	setupStatus: [SetupStatus | undefined];
	// 	cliStatus: [LocalStackCliStatus | undefined];
	// 	cli: [CliCheckResult | undefined];
	// }>();

	// emitter.emit("setupStatus", )

	const status = createValueEmitter<SetupStatus>();
	const cliPath = createValueEmitter<string | undefined>();
	// const cliStatus = createValueEmitter<LocalStackCliStatus>();

	// const statusEmitter = createEmitter<LocalStackCliStatus>(outputChannel);
	// let currentStatus: LocalStackCliStatus | undefined;

	// let currentCli: CliCheckResult | undefined;
	// const cliPathEmitter = createEmitter<CliCheckResult | undefined>(
	// 	outputChannel,
	// );

	const track = immediateOnce(async () => {
		const newCli = await findLocalStack().catch(() => undefined);
		outputChannel.info(`[cli]: findLocalStack = ${newCli?.cliPath}`);

		status.setValue(
			newCli?.found && newCli.executable && newCli.upToDate
				? "ok"
				: "setup_required",
		);
		cliPath.setValue(newCli?.cliPath);

		// if (areCliCheckResultsDifferent(currentCli, newCli)) {
		// 	currentCli = newCli;
		// 	void cliPathEmitter.emit(currentCli);
		// }

		// const newStatus = statusFromCliCheckResult(newCli);
		// if (currentStatus !== newStatus) {
		// 	currentStatus = newStatus;
		// 	void statusEmitter.emit(newStatus);
		// }
	});

	const watcher = watch(
		// Watch absolute paths only, since `localstack` is not a real path.
		CLI_PATHS.filter((path) => isAbsolute(path)),
	)
		.on("add", (path) => {
			outputChannel.trace(
				`[cli]: Detected new file at ${path}, re-checking CLI`,
			);
			track();
		})
		.on("change", (path) => {
			outputChannel.trace(
				`[cli]: Detected change to file at ${path}, re-checking CLI`,
			);
			track();
		})
		.on("unlink", (path) => {
			outputChannel.trace(
				`[cli]: Detected removal of file at ${path}, re-checking CLI`,
			);
			track();
		});

	track();

	return {
		// cli() {
		// 	return currentCli;
		// },
		// onCliChange(callback) {
		// 	cliPathEmitter.on(callback);
		// 	if (currentCli) {
		// 		callback(currentCli);
		// 	}
		// },
		// cliStatus() {
		// 	return currentStatus;
		// },
		// onCliStatusChange(callback) {
		// 	statusEmitter.on(callback);
		// 	if (currentStatus) {
		// 		callback(currentStatus);
		// 	}
		// },
		cliPath() {
			return cliPath.value();
		},
		onCliPathChange(callback) {
			cliPath.on(callback);
		},
		status() {
			return status.value();
		},
		onStatusChange(callback) {
			status.on(callback);
		},
		async dispose() {
			await watcher.close();
		},
	};
}
