import * as assert from "node:assert";

import { window } from "vscode";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

// import * as myExtension from '../../extension';

suite("Extension Test Suite", () => {
	window.showInformationMessage("Start all tests.");

	test("Sample test", () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});
