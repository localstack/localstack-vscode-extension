import type { ExtensionContext, LogOutputChannel, StatusBarItem } from "vscode";

import type { ContainerStatusTracker } from "./utils/container-status.ts";
import type { LocalStackStatusTracker } from "./utils/localstack-status.ts";
import type { SetupStatusTracker } from "./utils/setup-status.ts";
import type { Telemetry } from "./utils/telemetry.ts";

export type Deactivate = () => Promise<void> | void;

export interface PluginOptions {
	context: ExtensionContext;
	outputChannel: LogOutputChannel;
	statusBarItem: StatusBarItem;
	containerStatusTracker: ContainerStatusTracker;
	localStackStatusTracker: LocalStackStatusTracker;
	setupStatusTracker: SetupStatusTracker;
	telemetry: Telemetry;
}

export interface Plugin {
	deactivate: Deactivate;
}

export type PluginFactory = (options: PluginOptions) => Promise<Plugin>;

export const createPlugin = (
	// biome-ignore lint/suspicious/noConfusingVoidType: required
	handler: (options: PluginOptions) => Promise<Deactivate | void> | void,
): PluginFactory => {
	return async (options) => {
		const deactivate = (await handler(options)) ?? (() => {});
		return {
			deactivate,
		};
	};
};

export class PluginManager {
	private plugins: PluginFactory[];

	private deactivatables: Plugin[];

	constructor(plugins: PluginFactory[]) {
		this.plugins = plugins;
		this.deactivatables = [];
	}

	async activate(options: PluginOptions) {
		for (const activate of this.plugins) {
			const deactivatable = await activate(options);
			this.deactivatables.push(deactivatable);
		}
	}

	async deactivate() {
		for (const plugin of this.deactivatables) {
			await plugin.deactivate();
		}
	}
}
