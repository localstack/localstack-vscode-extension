import { resolve } from "node:dns/promises";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { window } from "vscode";
import type { LogOutputChannel } from "vscode";

import { readAuthToken } from "./authenticate.ts";
import { parseIni, serializeIni, updateIniSection } from "./ini-parser.ts";
import type { IniFile, IniSection } from "./ini-parser.ts";
import type { Telemetry } from "./telemetry.ts";

// Important: Add a newline to the beginning of the config and credentials files
// to avoid issues files without a newline at the end of the file.
// TODO: add a test for this.

const LOCALSTACK_CONFIG_PROFILE_NAME = "profile localstack";
const VALID_HOSTNAMES = [
	"localhost.localstack.cloud",
	"127.0.0.1",
	"localhost",
];
const DEFAULT_PORT = "4566";
const LOCALSTACK_CONFIG_PROPERTIES = {
	region: "us-east-1",
	output: "json",
};

// https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-files.html
//  Do not use the word profile when creating an entry in the credentials file.
const LOCALSTACK_CREDENTIALS_PROFILE_NAME = "localstack";
const LOCALSTACK_CREDENTIALS_PROPERTIES = {
	aws_access_key_id: "test",
	aws_secret_access_key: "test",
};

export const AWS_DIRECTORY = path.join(os.homedir(), ".aws");
export const AWS_CONFIG_FILENAME = path.join(AWS_DIRECTORY, "config");
export const AWS_CREDENTIALS_FILENAME = path.join(AWS_DIRECTORY, "credentials");

async function overrideSelection(
	filesToModify: string[],
	override: boolean = false,
): Promise<OverrideDecision | undefined> {
	if (override === true) {
		return "Override";
	}
	const fileList = filesToModify.join(" and ");
	const selection = await window.showWarningMessage(
		`The AWS profile named "localstack" in ${fileList} exists, but does not match the expected properties. Do you want to override it?`,
		"Override",
	);
	return selection;
}

function isValidEndpointUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			(parsed.protocol === "http:" || parsed.protocol === "https:") &&
			VALID_HOSTNAMES.includes(parsed.hostname) &&
			parsed.port !== "" // port must be present
		);
	} catch {
		return false;
	}
}

async function checkIfConfigNeedsOverride(
	section: IniSection | undefined,
): Promise<boolean> {
	if (!section) {
		return true; // profile doesn't exist
	}

	if (
		section.properties.endpoint_url === "http://localhost.localstack.cloud:4566"
	) {
		const isDnsResolved = await dnsResolveCheck(undefined);
		if (!isDnsResolved) {
			// if DNS is not resolved, we need to override the endpoint_url
			return true;
		}
	}

	return !(
		section.properties.region &&
		section.properties.endpoint_url &&
		isValidEndpointUrl(section.properties.endpoint_url)
	);
}

function checkIfCredentialsNeedsOverride(
	section: IniSection | undefined,
): boolean {
	if (!section) {
		return true; // profile doesn't exist
	}

	return !(
		section.properties.aws_access_key_id ===
			LOCALSTACK_CREDENTIALS_PROPERTIES.aws_access_key_id &&
		section.properties.aws_secret_access_key ===
			LOCALSTACK_CREDENTIALS_PROPERTIES.aws_secret_access_key
	);
}

async function getProfile(filename: string, profileName: string) {
	const contents = await readFile(filename);
	const iniFile = parseIni(contents);
	const section = iniFile.sections.find((s) => s.name === profileName);
	return { contents, iniFile, section };
}

async function dnsResolveCheck(
	outputChannel: LogOutputChannel | undefined,
): Promise<boolean> {
	try {
		const addresses = await resolve("test.localhost.localstack.cloud");
		return addresses.includes("127.0.0.1");
	} catch (error) {
		outputChannel?.warn(
			`[aws-profile]: Could not resolve "test.localhost.localstack.cloud". Falling back to "http://127.0.0.1:4566" for the endpoint_url in AWS profile "localstack". Your system may have DNS Rebind Protection enabled, which can block custom DNS names like "localhost.localstack.cloud"`,
		);
		return false;
	}
}

type OverrideDecision = "Override" | "do_not_override";

async function configureAwsConfigProfile(
	awsConfigFilename: string,
	contents: string,
	iniFile: IniFile,
	section: IniSection | undefined,
	overrideDecision: OverrideDecision | undefined = undefined,
	outputChannel: LogOutputChannel | undefined,
): Promise<boolean | undefined> {
	const awsConfigFilenameReadable = awsConfigFilename.replace(
		os.homedir(),
		"~",
	);

	try {
		if (section) {
			// LocalStack profile exists, but does not match the expected properties
			if (overrideDecision === "Override") {
				// User chose to override the existing profile.

				// check if dnsResolveCheck is successful
				const isDnsResolved = await dnsResolveCheck(outputChannel);
				const endpointUrl = isDnsResolved
					? `http://localhost.localstack.cloud:${DEFAULT_PORT}`
					: `http://127.0.0.1:${DEFAULT_PORT}`;

				const updatedIniFile = updateIniSection(
					iniFile,
					LOCALSTACK_CONFIG_PROFILE_NAME,
					{
						region: LOCALSTACK_CONFIG_PROPERTIES.region,
						output: LOCALSTACK_CONFIG_PROPERTIES.output,
						endpoint_url: endpointUrl,
					},
				);

				const updatedContents = `${serializeIni(updatedIniFile)}\n`;
				await fs.writeFile(awsConfigFilename, updatedContents);
				return true;
			} else if (overrideDecision === undefined) {
				// User cancelled the selection.
				return undefined;
			}
			return false;
		}

		// LocalStack profile does not exist: create it.
		// check if dnsResolveCheck is successful
		const isDnsResolved = await dnsResolveCheck(outputChannel);
		const endpointUrl = isDnsResolved
			? `http://localhost.localstack.cloud:${DEFAULT_PORT}`
			: `http://127.0.0.1:${DEFAULT_PORT}`;

		const updatedIniFile = updateIniSection(
			iniFile,
			LOCALSTACK_CONFIG_PROFILE_NAME,
			{
				region: LOCALSTACK_CONFIG_PROPERTIES.region,
				output: LOCALSTACK_CONFIG_PROPERTIES.output,
				endpoint_url: endpointUrl,
			},
		);

		const updatedContents =
			contents.trim() === ""
				? `${serializeIni(updatedIniFile).trim()}\n`
				: `${serializeIni(updatedIniFile)}\n`;
		await fs.writeFile(awsConfigFilename, updatedContents);

		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		window.showErrorMessage(
			`Failed to configure the AWS profile named "localstack" in [${awsConfigFilenameReadable}]: ${errorMessage}`,
		);
	}
}

async function configureCredentialsProfile(
	awsCredentialsFilename: string,
	contents: string,
	iniFile: IniFile,
	section: IniSection | undefined,
	overrideDecision: string | undefined = undefined,
): Promise<boolean | undefined> {
	const awsCredentialsFilenameReadable = awsCredentialsFilename.replace(
		os.homedir(),
		"~",
	);

	try {
		// LocalStack profile exists, but does not match the expected properties
		if (section) {
			if (overrideDecision === "Override") {
				// User chose to override the existing profile.
				const updatedIniFile = updateIniSection(
					iniFile,
					LOCALSTACK_CREDENTIALS_PROFILE_NAME,
					LOCALSTACK_CREDENTIALS_PROPERTIES,
				);

				const updatedContents = `${serializeIni(updatedIniFile)}\n`;
				await fs.writeFile(awsCredentialsFilename, updatedContents);
				return true;
			} else if (overrideDecision === undefined) {
				// User cancelled the selection.
				return undefined;
			}
			return false;
		}

		// LocalStack profile does not exist: create it.
		const updatedIniFile = updateIniSection(
			iniFile,
			LOCALSTACK_CREDENTIALS_PROFILE_NAME,
			LOCALSTACK_CREDENTIALS_PROPERTIES,
		);

		// If the file is empty, we need to add a newline at the end.
		// Otherwise, we just write the updated INI file.
		// This is important to avoid issues with files without a newline at the end.
		const updatedContents =
			contents.trim() === ""
				? `${serializeIni(updatedIniFile).trim()}\n`
				: `${serializeIni(updatedIniFile)}\n`;
		await fs.writeFile(awsCredentialsFilename, updatedContents);

		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		window.showErrorMessage(
			`Failed to configure the AWS profile named "localstack" in [${awsCredentialsFilenameReadable}]: ${errorMessage}`,
		);
	}
	return false;
}

function isErrorWithCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

/**
 * Reads the contents of a file.
 *
 * If the file doesn't exist, returns an empty string.
 */
async function readFile(fileName: string) {
	try {
		const credentials = await fs.readFile(fileName, "utf-8");
		return credentials;
	} catch (error) {
		if (isErrorWithCode(error, "ENOENT")) {
			return "";
		}
		throw error;
	}
}

export async function configureAwsProfiles(options: {
	telemetry?: Telemetry; // for testing purposes
	awsDirectory?: string;
	forceOverride?: boolean; // for testing purposes
	notifyNoChangesMade?: boolean;
	origin?: "manual_trigger" | "extension_startup";
	outputChannel?: LogOutputChannel;
}) {
	const trigger = options.origin ?? "manual_trigger";
	const startedAt = new Date().toISOString();
	const awsDirectory = options.awsDirectory ?? AWS_DIRECTORY;
	await fs.mkdir(awsDirectory, { recursive: true });

	const awsConfigFilename = path.join(awsDirectory, "config");
	const awsCredentialsFilename = path.join(awsDirectory, "credentials");

	// Get profile sections for both files
	const [
		{
			contents: configContents,
			iniFile: configIniFile,
			section: configSection,
		},
		{
			contents: credentialsContents,
			iniFile: credentialsIniFile,
			section: credentialsSection,
		},
	] = await Promise.all([
		getProfile(awsConfigFilename, LOCALSTACK_CONFIG_PROFILE_NAME),
		getProfile(awsCredentialsFilename, LOCALSTACK_CREDENTIALS_PROFILE_NAME),
	]);

	let overrideDecision: OverrideDecision | undefined;
	let configModified: boolean | undefined;
	let credentialsModified: boolean | undefined;

	const configNeedsOverride = await checkIfConfigNeedsOverride(configSection);
	const credentialsNeedsOverride =
		checkIfCredentialsNeedsOverride(credentialsSection);

	const authToken = await readAuthToken();

	// means sections exist, but we need to check what's inside
	if (credentialsSection && configSection) {
		if (!configNeedsOverride && !credentialsNeedsOverride) {
			// if everything in place, show user that no changes were made and return
			if (options?.notifyNoChangesMade) {
				window.showInformationMessage(
					'The AWS profile named "localstack" was already present, so no changes were made.',
				);
			}
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					step_order: 4,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
					auth_token: authToken,
				},
			});
			return;
		} else {
			// profile is there but needs adjustment
			// in testing, we always override
			if (options?.forceOverride) {
				overrideDecision = "Override";
			} else {
				// check which files need override
				const filesToModify = [];
				if (configNeedsOverride) filesToModify.push("~/.aws/config");
				if (credentialsNeedsOverride) filesToModify.push("~/.aws/credentials");
				// ask user if they want to override
				overrideDecision = await overrideSelection(filesToModify, false);
			}
		}
	} else {
		// we need to create it
		overrideDecision = "Override";
	}

	if (overrideDecision === undefined) {
		// user cancelled pop-up, so return early
		options.telemetry?.track({
			name: "aws_profile_configured",
			payload: {
				namespace: "onboarding",
				origin: trigger,
				step_order: 4,
				started_at: startedAt,
				ended_at: new Date().toISOString(),
				status: "SKIPPED",
				auth_token: authToken,
			},
		});
		return;
	} else if (overrideDecision === "Override") {
		if (configNeedsOverride && credentialsNeedsOverride) {
			[configModified, credentialsModified] = await Promise.all([
				configureAwsConfigProfile(
					awsConfigFilename,
					configContents,
					configIniFile,
					configSection,
					overrideDecision,
					options.outputChannel,
				),
				configureCredentialsProfile(
					awsCredentialsFilename,
					credentialsContents,
					credentialsIniFile,
					credentialsSection,
					overrideDecision,
				),
			]);
			window.showInformationMessage(
				'Successfully added the AWS profile named "localstack" to "~/.aws/config" and "~/.aws/credentials".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					step_order: 4,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
					auth_token: authToken,
				},
			});
		} else if (configNeedsOverride) {
			configModified = await configureAwsConfigProfile(
				awsConfigFilename,
				configContents,
				configIniFile,
				configSection,
				overrideDecision,
				options.outputChannel,
			);
			window.showInformationMessage(
				'Successfully added the AWS profile named "localstack" to "~/.aws/config".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					step_order: 4,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
					auth_token: authToken,
				},
			});
		} else if (credentialsNeedsOverride) {
			credentialsModified = await configureCredentialsProfile(
				awsCredentialsFilename,
				credentialsContents,
				credentialsIniFile,
				credentialsSection,
				overrideDecision,
			);
			window.showInformationMessage(
				'Successfully added the AWS profile named "localstack" to "~/.aws/credentials".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					step_order: 4,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
					auth_token: authToken,
				},
			});
		}
	}
}

export async function checkIsProfileConfigured(): Promise<boolean> {
	try {
		const [{ section: configSection }, { section: credentialsSection }] =
			await Promise.all([
				getProfile(AWS_CONFIG_FILENAME, LOCALSTACK_CONFIG_PROFILE_NAME),
				getProfile(
					AWS_CREDENTIALS_FILENAME,
					LOCALSTACK_CREDENTIALS_PROFILE_NAME,
				),
			]);

		const [configNeedsOverride, credentialsNeedsOverride] = await Promise.all([
			checkIfConfigNeedsOverride(configSection),
			checkIfCredentialsNeedsOverride(credentialsSection),
		]);

		if (configNeedsOverride || credentialsNeedsOverride) {
			return false;
		}

		return true; // profile exists in both files and is properly configured
	} catch (error) {
		return false;
	}
}
