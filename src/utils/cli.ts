import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { watch } from "chokidar";
import { workspace } from "vscode";
import type { CancellationToken, LogOutputChannel, Disposable } from "vscode";

import { CLI_PATHS, LOCALSTACK_DOCKER_IMAGE_NAME } from "../constants.ts";

import { createValueEmitter } from "./emitter.ts";
import { exec } from "./exec.ts";
import { immediateOnce } from "./immediate-once.ts";
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

export interface CliStatusTracker extends Disposable {
	status(): SetupStatus | undefined;
	onStatusChange(callback: (status: SetupStatus | undefined) => void): void;
	cliPath(): string | undefined;
	onCliPathChange(callback: (cliPath: string | undefined) => void): void;
}

export function createCliStatusTracker(
	outputChannel: LogOutputChannel,
): CliStatusTracker {
	const status = createValueEmitter<SetupStatus>();
	const cliPath = createValueEmitter<string | undefined>();

	const track = immediateOnce(async () => {
		const newCli = await findLocalStack().catch(() => undefined);
		outputChannel.info(`[cli]: findLocalStack = ${newCli?.cliPath}`);

		status.setValue(
			newCli?.found && newCli.executable && newCli.upToDate
				? "ok"
				: "setup_required",
		);
		cliPath.setValue(newCli?.cliPath);
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
		cliPath() {
			return cliPath.value();
		},
		onCliPathChange(callback) {
			cliPath.onChange(callback);
		},
		status() {
			return status.value();
		},
		onStatusChange(callback) {
			status.onChange(callback);
		},
		async dispose() {
			await watcher.close();
		},
	};
}
