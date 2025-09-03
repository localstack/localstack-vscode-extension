import * as assert from "node:assert";

import { LogLevel } from "vscode";
import type { LogOutputChannel, Event } from "vscode";

import { createJsonlStream } from "../utils/jsonl-stream.js";

const setup = () => {
	const mockOutputChannel: LogOutputChannel = {
		name: "test",
		logLevel: LogLevel.Info,
		onDidChangeLogLevel: {} as Event<LogLevel>,
		append: () => {},
		appendLine: () => {},
		replace: () => {},
		clear: () => {},
		show: () => {},
		hide: () => {},
		dispose: () => {},
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};

	const jsonlStream = createJsonlStream(mockOutputChannel);

	const callbackCalls: unknown[] = [];
	const callback = (data: unknown) => {
		callbackCalls.push(data);
	};
	jsonlStream.on(callback);

	return {
		jsonlStream,
		callbackCalls,
	};
};

suite("JSONL Streams", () => {
	test("should parse and emit complete JSONL messages", () => {
		const { jsonlStream, callbackCalls } = setup();

		// Test with multiple JSON objects in a single write
		const testData = Buffer.from('{"key1":"value1"}\n{"key2":"value2"}\n');

		jsonlStream.write(testData);

		assert.strictEqual(callbackCalls.length, 2);
		assert.deepStrictEqual(callbackCalls[0], { key1: "value1" });
		assert.deepStrictEqual(callbackCalls[1], { key2: "value2" });
	});

	test("should handle incomplete JSONL messages across multiple writes", () => {
		const { jsonlStream, callbackCalls } = setup();

		// First write with partial message
		const firstChunk = Buffer.from('{"key":"value');
		jsonlStream.write(firstChunk);

		// Shouldn't emit anything yet
		assert.strictEqual(callbackCalls.length, 0);

		// Complete the message in second write
		const secondChunk = Buffer.from('1"}\n');
		jsonlStream.write(secondChunk);

		// Now it should emit the complete message
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { key: "value1" });
	});

	test("should handle multiple messages in chunks", () => {
		const { jsonlStream, callbackCalls } = setup();

		// Write first message and part of second
		const firstChunk = Buffer.from('{"first":1}\n{"second":');
		jsonlStream.write(firstChunk);

		// First message should be emitted
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { first: 1 });

		// Complete second message and add third
		const secondChunk = Buffer.from('2}\n{"third":3}\n');
		jsonlStream.write(secondChunk);

		// Should have all three messages now
		assert.strictEqual(callbackCalls.length, 3);
		assert.deepStrictEqual(callbackCalls[1], { second: 2 });
		assert.deepStrictEqual(callbackCalls[2], { third: 3 });
	});

	test("should ignore invalid JSON lines", () => {
		const { jsonlStream, callbackCalls } = setup();

		const testData = Buffer.from('not json\n{"valid":true}\n{invalid}\n');

		jsonlStream.write(testData);

		// Should only emit the valid JSON object
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { valid: true });
	});

	test("should handle empty lines", () => {
		const { jsonlStream, callbackCalls } = setup();

		const testData = Buffer.from('\n\n{"key":"value"}\n\n');

		jsonlStream.write(testData);

		// Should only emit the valid JSON object
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { key: "value" });
	});
});
