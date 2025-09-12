import { immediateOnce } from "./immediate-once.ts";

export type Callback<T> = (value: T) => Promise<void> | void;

export interface ValueEmitter<T> {
	value(): T | undefined;
	setValue(value: T): void;
	onChange(callback: Callback<T>): void;
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
		onChange(callback) {
			callbacks.push(callback);
			if (currentValue) {
				void Promise.resolve(callback(currentValue)).catch(() => {});
			}
		},
	};
}
