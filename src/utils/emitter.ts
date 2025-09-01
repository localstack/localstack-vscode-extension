import type { LogOutputChannel } from "vscode";

export type Callback<T> = (value: T) => Promise<void> | void;

export interface Emitter<T> {
	on(callback: Callback<T>): void;
	emit(value: T): Promise<void>;
}

export function createEmitter<T>(outputChannel: LogOutputChannel): Emitter<T> {
	const callbacks: Callback<T>[] = [];

	return {
		on(callback) {
			callbacks.push(callback);
		},
		async emit(value) {
			for (const callback of callbacks) {
				try {
					await callback(value);
				} catch (error) {
					outputChannel.error(error instanceof Error ? error : String(error));
				}
			}
		},
	};
}
