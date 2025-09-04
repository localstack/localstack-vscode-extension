import { resolve } from "node:dns/promises";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { window } from "vscode";

import { parseIni, serializeIni, updateIniSection } from "./ini-parser.ts";
import type { IniFile, IniSection } from "./ini-parser.ts";
import type { Telemetry } from "./telemetry.ts";

// Important: Add a newline to the beginning of the config and credentials files
// to avoid issues files without a newline at the end of the file.
// TODO: add a test for this.

const LOCALSTACK_CONFIG_PROFILE_NAME = "profile localstack";
const VALID_ENDPOINT_URLS = [
	"http://localhost.localstack.cloud:4566", // default
	"http://127.0.0.1:4566",
	"http://localhost:4566",
];
const LOCALSTACK_CONFIG_PROPERTIES = {
	region: "us-east-1",
	output: "json",
	endpoint_url: VALID_ENDPOINT_URLS,
};

// https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-files.html
//  Do not use the word profile when creating an entry in the credentials file.
const LOCALSTACK_CREDENTIALS_PROFILE_NAME = "localstack";
const LOCALSTACK_CREDENTIALS_PROPERTIES = {
	aws_access_key_id: "test",
	aws_secret_access_key: "test",
};

const AWS_DIRECTORY = path.join(os.homedir(), ".aws");

async function overrideSelection(
	filesToModify: string[],
	override: boolean = false,
): Promise<OverrideDecision | undefined> {
	if (override === true) {
		return "override";
	}
	const fileList = filesToModify.join(" and ");
	const selection = await window.showWarningMessage(
		`The "localstack" AWS profile in ${fileList} exists, but does not match the expected properties. Do you want to override it?`,
		"override",
	);
	return selection;
}

function checkIfConfigNeedsOverride(section: IniSection | undefined): boolean {
	if (!section) {
		return true; // profile doesn't exist
	}

	return !(
		section.properties.region &&
		section.properties.endpoint_url &&
		VALID_ENDPOINT_URLS.includes(section.properties.endpoint_url)
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

async function dnsResolveCheck(): Promise<boolean> {
	try {
		const addresses = await resolve("test.localhost.localstack.cloud");
		return addresses.includes("127.0.0.1");
	} catch (error) {
		return false;
	}
}

type OverrideDecision = "override" | "do_not_override";

async function configureAwsConfigProfile(
	awsConfigFilename: string,
	contents: string,
	iniFile: IniFile,
	section: IniSection | undefined,
	overrideDecision: OverrideDecision | undefined = undefined,
): Promise<boolean | undefined> {
	const awsConfigFilenameReadable = awsConfigFilename.replace(
		os.homedir(),
		"~",
	);

	try {
		if (section) {
			// LocalStack profile exists, but does not match the expected properties
			if (overrideDecision === "override") {
				// User chose to override the existing profile.

				// check if dnsResolveCheck is successful
				const isDnsResolved = await dnsResolveCheck();
				const endpointUrl = isDnsResolved
					? "http://localhost.localstack.cloud:4566"
					: VALID_ENDPOINT_URLS[1];

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
		const isDnsResolved = await dnsResolveCheck();
		const endpointUrl = isDnsResolved
			? "http://localhost.localstack.cloud:4566"
			: VALID_ENDPOINT_URLS[1];

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
			`Failed to configure the "localstack" AWS profile in [${awsConfigFilenameReadable}]: ${errorMessage}`,
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
			if (overrideDecision === "override") {
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
			`Failed to configure the "localstack" AWS profile in [${awsCredentialsFilenameReadable}]: ${errorMessage}`,
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

	const configNeedsOverride = checkIfConfigNeedsOverride(configSection);
	const credentialsNeedsOverride =
		checkIfCredentialsNeedsOverride(credentialsSection);

	// means sections exist, but we need to check what's inside
	if (credentialsSection && configSection) {
		if (!configNeedsOverride && !credentialsNeedsOverride) {
			// if everything in place, show user that no changes were made and return
			if (options?.notifyNoChangesMade) {
				window.showInformationMessage(
					'The "localstack" AWS profiles were already present, so no changes were made.',
				);
			}
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					position: 3,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
				},
			});
			return;
		} else {
			// profiles are there but need adjustment
			// in testing, we always override
			if (options?.forceOverride) {
				overrideDecision = "override";
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
		// if any of the profiles don't exist, we need to create it
		overrideDecision = "override";
	}

	if (overrideDecision === undefined) {
		// user cancelled pop-up, so return early
		options.telemetry?.track({
			name: "aws_profile_configured",
			payload: {
				namespace: "onboarding",
				origin: trigger,
				position: 3,
				started_at: startedAt,
				ended_at: new Date().toISOString(),
				status: "SKIPPED",
			},
		});
		return;
	} else if (overrideDecision === "override") {
		if (configNeedsOverride && credentialsNeedsOverride) {
			[configModified, credentialsModified] = await Promise.all([
				configureAwsConfigProfile(
					awsConfigFilename,
					configContents,
					configIniFile,
					configSection,
					overrideDecision,
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
				'Successfully added the "localstack" AWS profile to "~/.aws/config" and "~/.aws/credentials".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					position: 3,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
				},
			});
		} else if (configNeedsOverride) {
			configModified = await configureAwsConfigProfile(
				awsConfigFilename,
				configContents,
				configIniFile,
				configSection,
				overrideDecision,
			);
			window.showInformationMessage(
				'Successfully added the "localstack" AWS profile to "~/.aws/config".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					position: 3,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
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
				'Successfully added the "localstack" AWS profile to "~/.aws/credentials".',
			);
			options.telemetry?.track({
				name: "aws_profile_configured",
				payload: {
					namespace: "onboarding",
					origin: trigger,
					position: 3,
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
				},
			});
		}
	}
}

export async function checkIsProfileConfigured(): Promise<boolean> {
	try {
		const awsConfigFilename = path.join(AWS_DIRECTORY, "config");
		const awsCredentialsFilename = path.join(AWS_DIRECTORY, "credentials");

		const [{ section: configSection }, { section: credentialsSection }] =
			await Promise.all([
				getProfile(awsConfigFilename, LOCALSTACK_CONFIG_PROFILE_NAME),
				getProfile(awsCredentialsFilename, LOCALSTACK_CREDENTIALS_PROFILE_NAME),
			]);

		const [configNeedsOverride, credentialsNeedsOverride] = await Promise.all([
			checkIfConfigNeedsOverride(configSection),
			checkIfCredentialsNeedsOverride(credentialsSection),
		]);

		if (configNeedsOverride || credentialsNeedsOverride) {
			return false;
		}

		return true; // Both profiles exist and are properly configured
	} catch (error) {
		return false;
	}
}
