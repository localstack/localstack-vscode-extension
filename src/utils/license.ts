import { homedir, platform } from "node:os";
import { join } from "node:path";

import type { CancellationToken, LogOutputChannel } from "vscode";

import { execLocalStack } from "./cli.ts";

/**
 * See https://github.com/localstack/localstack/blob/de861e1f656a52eaa090b061bd44fc1a7069715e/localstack-core/localstack/utils/files.py#L38-L55.
 * @returns The cache directory for the current platform.
 */
const cacheDirectory = () => {
	switch (platform()) {
		case "win32":
			return join(process.env.LOCALAPPDATA!, "cache");
		case "darwin":
			return join(homedir(), "Library", "Caches");
		default:
			return process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
	}
};

/**
 * The file that contains the license information of the LocalStack CLI.
 *
 * The license file is stored in the cache directory for the current platform.
 */
export const LICENSE_FILENAME = join(
	cacheDirectory(),
	"localstack-cli",
	"license.json",
);

const LICENSE_VALIDITY_MARKER = "license validity: valid";

export async function checkIsLicenseValid(outputChannel: LogOutputChannel) {
	try {
		const licenseInfoResponse = await execLocalStack(["license", "info"], {
			outputChannel,
		});
		return licenseInfoResponse.stdout.includes(LICENSE_VALIDITY_MARKER);
	} catch (error) {
		outputChannel.error(error instanceof Error ? error : String(error));

		return false;
	}
}

export async function activateLicense(outputChannel: LogOutputChannel) {
	try {
		await execLocalStack(["license", "activate"], {
			outputChannel,
		});
	} catch (error) {
		outputChannel.error(error instanceof Error ? error : String(error));
	}
}

export async function activateLicenseUntilValid(
	outputChannel: LogOutputChannel,
	cancellationToken: CancellationToken,
): Promise<void> {
	while (true) {
		if (cancellationToken.isCancellationRequested) {
			break;
		}
		const licenseIsValid = await checkIsLicenseValid(outputChannel);
		if (licenseIsValid) {
			break;
		}
		await activateLicense(outputChannel);
		// Wait before trying again
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}
