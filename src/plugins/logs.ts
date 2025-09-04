import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import { createPlugin } from "../plugins.ts";
import { pipeToLogOutputChannel } from "../utils/spawn.ts";

export default createPlugin(
	"logs",
	({ context, outputChannel, containerStatusTracker }) => {
		let logsProcess: ChildProcess | undefined;

		const startLogging = () => {
			logsProcess?.kill();

			const now = Math.floor(Date.now() / 1000);
			logsProcess = spawn(
				"docker",
				["logs", "localstack-main", "--follow", "--since", String(now)],
				{
					stdio: "pipe",
				},
			);
			pipeToLogOutputChannel(logsProcess, outputChannel, "[localstack.logs]: ");
		};

		const stopLogging = () => {
			logsProcess?.kill();
			logsProcess = undefined;
		};

		containerStatusTracker.onChange((status) => {
			if (status === "running") {
				startLogging();
			} else if (status === "stopped") {
				stopLogging();
			}
		});

		context.subscriptions.push({
			dispose() {
				logsProcess?.kill();
			},
		});
	},
);
