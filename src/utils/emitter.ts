import type { LogOutputChannel } from "vscode";

import { immediateOnce } from "./immediate-once.ts";

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

export interface ValueEmitter<T> {
	value(): T | undefined;
	setValue(value: T): void;
	on(callback: Callback<T>): void;
}

export function createValueEmitter<T>(): ValueEmitter<T> {
	let currentValue: T;
	const callbacks: Callback<T>[] = [];

	const emit = immediateOnce(async () => {
		for (const callback of callbacks) {
			try {
				await callback(currentValue);
			} catch {}
		}
	});

	return {
		value() {
			return currentValue;
		},
		setValue(value) {
			if (currentValue !== value) {
				currentValue = value;
				emit();
			}
		},
		on(callback) {
			callbacks.push(callback);
		},
	};
}
