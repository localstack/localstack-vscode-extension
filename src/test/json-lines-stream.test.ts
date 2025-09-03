import * as assert from "node:assert";

import { JsonLinesStream } from "../utils/json-lines-stream.js";

const setup = () => {
	const stream = new JsonLinesStream();

	const callbackCalls: unknown[] = [];
	stream.onJson((data: unknown) => {
		callbackCalls.push(data);
	});

	return {
		stream,
		callbackCalls,
	};
};

suite("JsonLinesStream Test Suite", () => {
	test("should parse and emit complete JsonLines messages", () => {
		const { stream, callbackCalls } = setup();

		// Test with multiple JSON objects in a single write
		const testData = Buffer.from('{"key1":"value1"}\n{"key2":"value2"}\n');

		stream.write(testData);

		assert.strictEqual(callbackCalls.length, 2);
		assert.deepStrictEqual(callbackCalls[0], { key1: "value1" });
		assert.deepStrictEqual(callbackCalls[1], { key2: "value2" });
	});

	test("should handle incomplete JsonLines messages across multiple writes", () => {
		const { stream, callbackCalls } = setup();

		// First write with partial message
		const firstChunk = Buffer.from('{"key":"value');
		stream.write(firstChunk);

		// Shouldn't emit anything yet
		assert.strictEqual(callbackCalls.length, 0);

		// Complete the message in second write
		const secondChunk = Buffer.from('1"}\n');
		stream.write(secondChunk);

		// Now it should emit the complete message
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { key: "value1" });
	});

	test("should handle multiple messages in chunks", () => {
		const { stream, callbackCalls } = setup();

		// Write first message and part of second
		const firstChunk = Buffer.from('{"first":1}\n{"second":');
		stream.write(firstChunk);

		// First message should be emitted
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { first: 1 });

		// Complete second message and add third
		const secondChunk = Buffer.from('2}\n{"third":3}\n');
		stream.write(secondChunk);

		// Should have all three messages now
		assert.strictEqual(callbackCalls.length, 3);
		assert.deepStrictEqual(callbackCalls[1], { second: 2 });
		assert.deepStrictEqual(callbackCalls[2], { third: 3 });
	});

	test("should ignore invalid JSON lines", () => {
		const { stream, callbackCalls } = setup();

		const testData = Buffer.from('not json\n{"valid":true}\n{invalid}\n');

		stream.write(testData);

		// Should only emit the valid JSON object
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { valid: true });
	});

	test("should handle empty lines", () => {
		const { stream, callbackCalls } = setup();

		const testData = Buffer.from('\n\n{"key":"value"}\n\n');

		stream.write(testData);

		// Should only emit the valid JSON object
		assert.strictEqual(callbackCalls.length, 1);
		assert.deepStrictEqual(callbackCalls[0], { key: "value" });
	});
});
