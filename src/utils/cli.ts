import { constants } from "node:fs";
import { access } from "node:fs/promises";

import type { CancellationToken, LogOutputChannel } from "vscode";
import { workspace } from "vscode";

import { CLI_PATHS, LOCALSTACK_DOCKER_IMAGE_NAME } from "../constants.ts";

import { exec } from "./exec.ts";
import { spawn } from "./spawn.ts";
import type { SpawnOptions } from "./spawn.ts";

const IMAGE_NAME = LOCALSTACK_DOCKER_IMAGE_NAME; // not using the import directly as the constant name should match the env var
const LOCALSTACK_LDM_PREVIEW = "1";

const findLocalStack = async (): Promise<string> => {
	// Check if a custom path is configured
	const config = workspace.getConfiguration("localstack");
	const customLocation = config.get<string | null>("cli.location");

	if (customLocation) {
		try {
			await access(customLocation, constants.X_OK);
			return customLocation;
		} catch (error) {
			throw new Error(
				`Configured LocalStack CLI location '${customLocation}' is not accessible: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			);
		}
	}

	// Fall back to default search paths
	for (const CLI_PATH of CLI_PATHS) {
		try {
			await access(CLI_PATH, constants.X_OK);
			return CLI_PATH;
		} catch {
			// Continue to next path
		}
	}

	throw new Error(
		"LocalStack CLI could not be found in any of the default locations",
	);
};

export const execLocalStack = async (
	args: string[],
	options: {
		outputChannel: LogOutputChannel;
		// cancellationToken?: CancellationToken;
	},
) => {
	const cli = await findLocalStack();

	const response = await exec([`"${cli}"`, ...args].join(" "), {
		env: {
			...process.env,
			IMAGE_NAME,
			LOCALSTACK_LDM_PREVIEW,
		},
	});
	return response;
};

export const spawnLocalStack = async (
	args: string[],
	options: {
		outputChannel: LogOutputChannel;
		cancellationToken?: CancellationToken;
		onStderr?: SpawnOptions["onStderr"];
	},
) => {
	const cli = await findLocalStack();

	return spawn(`"${cli}"`, args, {
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
