import type { LogOutputChannel } from "vscode";

import { execLocalStack } from "./cli.ts";

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
	await execLocalStack(["license", "activate"], {
		outputChannel,
	});
}

export async function activateLicenseUntilValid(
	outputChannel: LogOutputChannel,
): Promise<void> {
	while (true) {
		const licenseIsValid = await checkIsLicenseValid(outputChannel);
		if (licenseIsValid) {
			break;
		}
		await activateLicense(outputChannel);
		// Wait before trying again
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}
