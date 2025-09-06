import type { LogOutputChannel } from "vscode";
import * as z from "zod/v4-mini";

import { checkIsAuthenticated } from "./authenticate.ts";
import { checkIsProfileConfigured } from "./configure-aws.ts";
import { exec } from "./exec.ts";
import { checkLocalstackInstalled } from "./install.ts";
import { checkIsLicenseValid } from "./license.ts";
import { spawn } from "./spawn.ts";

export async function checkSetupStatus(outputChannel: LogOutputChannel) {
	const [isInstalled, isAuthenticated, isLicenseValid, isProfileConfigured] =
		await Promise.all([
			checkLocalstackInstalled(outputChannel),
			checkIsAuthenticated(),
			checkIsLicenseValid(outputChannel),
			checkIsProfileConfigured(),
		]);

	return {
		isInstalled,
		isAuthenticated,
		isLicenseValid,
		isProfileConfigured,
	};
}

const LOCALSTACK_DOCKER_IMAGE = "localstack/localstack-pro";

export async function updateDockerImage(
	outputChannel: LogOutputChannel,
): Promise<void> {
	const imageVersion = await getDockerImageSemverVersion(outputChannel);
	if (!imageVersion) {
		await pullDockerImage(outputChannel);
	}
}

const InspectSchema = z.array(
	z.object({
		Config: z.object({
			Env: z.array(z.string()),
		}),
	}),
);

async function inspectDockerImage(
	outputChannel: LogOutputChannel,
): Promise<string | undefined> {
	try {
		const { stdout } = await exec(`docker inspect ${LOCALSTACK_DOCKER_IMAGE}`);
		const data: unknown = JSON.parse(stdout);
		const parsed = InspectSchema.safeParse(data);
		if (!parsed.success) {
			throw new Error(
				`Could not parse "docker inspect" output: ${JSON.stringify(z.treeifyError(parsed.error))}`,
			);
		}
		const env = parsed.data[0]?.Config.Env ?? [];
		const version = env
			.find((line) => line.startsWith("LOCALSTACK_BUILD_VERSION="))
			?.slice("LOCALSTACK_BUILD_VERSION=".length);
		return version;
	} catch (error) {
		outputChannel.error("Could not inspect LocalStack docker image");
		outputChannel.error(error instanceof Error ? error : String(error));
		return undefined;
	}
}

async function getDockerImageSemverVersion(
	outputChannel: LogOutputChannel,
): Promise<string | undefined> {
	const imageVersion = await inspectDockerImage(outputChannel);
	if (!imageVersion) {
		return;
	}

	return imageVersion;
}

async function pullDockerImage(outputChannel: LogOutputChannel): Promise<void> {
	try {
		await spawn("docker", ["pull", LOCALSTACK_DOCKER_IMAGE], {
			outputChannel,
			outputLabel: "docker.pull",
		});
	} catch (error) {
		outputChannel.error("Could not pull LocalStack docker image");
		outputChannel.error(error instanceof Error ? error : String(error));
	}
}
