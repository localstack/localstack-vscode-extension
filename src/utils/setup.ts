import type { CancellationToken, LogOutputChannel } from "vscode";
import * as z from "zod/v4-mini";

import { LOCALSTACK_DOCKER_IMAGE_NAME } from "../constants.ts";

import { exec } from "./exec.ts";
import { checkLocalstackInstalled } from "./install.ts";
import { spawn } from "./spawn.ts";

export async function checkSetupStatus(outputChannel: LogOutputChannel) {
	const [isInstalled] = await Promise.all([
		checkLocalstackInstalled(outputChannel),
	]);

	return {
		isInstalled,
	};
}

export async function updateDockerImage(
	outputChannel: LogOutputChannel,
	cancellationToken: CancellationToken,
): Promise<void> {
	const imageVersion = await getDockerImageSemverVersion(outputChannel);
	if (!imageVersion) {
		await pullDockerImage(outputChannel, cancellationToken);
	}
}

const InspectSchema = z.array(
	z.object({
		Config: z.object({
			Env: z.array(z.string()),
		}),
	}),
);

async function getDockerImageSemverVersion(
	outputChannel: LogOutputChannel,
): Promise<string | undefined> {
	try {
		const { stdout } = await exec(
			`docker inspect ${LOCALSTACK_DOCKER_IMAGE_NAME}`,
		);
		const data: unknown = JSON.parse(stdout);
		const parsed = InspectSchema.safeParse(data);
		if (!parsed.success) {
			throw new Error(
				`Could not parse "docker inspect" output: ${JSON.stringify(z.treeifyError(parsed.error))}`,
			);
		}
		const env = parsed.data[0]?.Config.Env ?? [];
		const imageVersion = env
			.find((line) => line.startsWith("LOCALSTACK_BUILD_VERSION="))
			?.slice("LOCALSTACK_BUILD_VERSION=".length);
		if (!imageVersion) {
			return;
		}
		return imageVersion;
	} catch (error) {
		outputChannel.error("Could not inspect LocalStack docker image");
		outputChannel.error(error instanceof Error ? error : String(error));
		return undefined;
	}
}

async function pullDockerImage(
	outputChannel: LogOutputChannel,
	cancellationToken: CancellationToken,
): Promise<void> {
	try {
		await spawn("docker", ["pull", LOCALSTACK_DOCKER_IMAGE_NAME], {
			outputChannel,
			outputLabel: "docker.pull",
			cancellationToken,
		});
	} catch (error) {
		outputChannel.error("Could not pull LocalStack docker image");
		outputChannel.error(error instanceof Error ? error : String(error));
	}
}
