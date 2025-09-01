import * as assert from "node:assert";

import {
	parseIni,
	serializeIni,
	updateIniSection,
} from "../utils/ini-parser.ts";

suite("INI Parser Test Suite", () => {
	test("parseIni should parse basic INI content", () => {
		const content = [
			"# This is a comment",
			"[section1]",
			"key1 = value1",
			"key2 = value2",
			"",
			"[section2]",
			"key3 = value3",
			"",
		].join("\n");

		const result = parseIni(content);

		assert.strictEqual(result.header.length, 1);
		assert.strictEqual(result.header[0], "# This is a comment");

		assert.strictEqual(result.sections.length, 2);

		const section1 = result.sections[0];
		assert.strictEqual(section1.name, "section1");
		assert.strictEqual(section1.properties.key1, "value1");
		assert.strictEqual(section1.properties.key2, "value2");

		const section2 = result.sections[1];
		assert.strictEqual(section2.name, "section2");
		assert.strictEqual(section2.properties.key3, "value3");
	});

	test("parseIni should handle AWS config format with 'profile' prefix", () => {
		const content = [
			"[default]",
			"region = us-west-2",
			"output = json",
			"",
			"[profile localstack]",
			"region = us-east-1",
			"output = json",
			"endpoint_url = http://localhost:4566",
			"",
		].join("\n");

		const result = parseIni(content);

		assert.strictEqual(result.sections.length, 2);
		assert.strictEqual(result.sections[0].name, "default");
		assert.strictEqual(result.sections[1].name, "profile localstack");
		assert.strictEqual(
			result.sections[1].properties.endpoint_url,
			"http://localhost:4566",
		);
	});

	test("parseIni should preserve comments within sections", () => {
		const content = [
			"[section1]",
			"# This is a comment within the section",
			"key1 = value1",
			"; This is another comment style",
			"key2 = value2",
			"",
		].join("\n");

		const result = parseIni(content);
		const section = result.sections[0];

		assert.strictEqual(section.lines.length, 6);
		assert.strictEqual(
			section.lines[1],
			"# This is a comment within the section",
		);
		assert.strictEqual(section.lines[3], "; This is another comment style");
	});

	test("serializeIni should preserve original formatting", () => {
		const content = [
			"# Header comment",
			"[section1]",
			"key1 = value1",
			"# Comment in section",
			"key2 = value2",
			"",
			"[section2]",
			"key3 = value3",
			"",
		].join("\n");

		const parsed = parseIni(content);
		const serialized = serializeIni(parsed);

		assert.strictEqual(
			serialized,
			"# Header comment\n\n[section1]\nkey1 = value1\n# Comment in section\nkey2 = value2\n\n[section2]\nkey3 = value3\n",
		);
	});

	test("updateIniSection should update existing section", () => {
		const content = ["[section1]", "key1 = oldvalue", "key2 = value2", ""].join(
			"\n",
		);

		const parsed = parseIni(content);
		const updated = updateIniSection(parsed, "section1", {
			key1: "newvalue",
			key3: "value3",
		});

		const section = updated.sections[0];
		assert.strictEqual(section.properties.key1, "newvalue");
		assert.strictEqual(section.properties.key2, "value2");
		assert.strictEqual(section.properties.key3, "value3");
	});

	test("updateIniSection should add new section if it doesn't exist", () => {
		const content = ["[section1]", "key1 = value1", ""].join("\n");
		const parsed = parseIni(content);
		const updated = updateIniSection(parsed, "section2", { key2: "value2" });

		assert.strictEqual(updated.sections.length, 2);
		assert.strictEqual(updated.sections[1].name, "section2");
		assert.strictEqual(updated.sections[1].properties.key2, "value2");
	});

	test("updateIniSection should preserve comments when updating", () => {
		const content = [
			"[section1]",
			"# Important comment",
			"key1 = oldvalue",
			"; Another comment",
			"key2 = value2",
			"",
		].join("\n");

		const parsed = parseIni(content);
		const updated = updateIniSection(parsed, "section1", { key1: "newvalue" });
		const serialized = serializeIni(updated);

		const updatedContent = [
			"[section1]",
			"# Important comment",
			"key1 = newvalue",
			"; Another comment",
			"key2 = value2",
			"",
		].join("\n");

		assert.strictEqual(serialized, updatedContent);
	});

	test("should handle empty files", () => {
		const result = parseIni("");
		assert.strictEqual(result.sections.length, 0);
		assert.strictEqual(result.header.length, 1); // Empty string creates one empty line
	});

	test("should handle files with only comments", () => {
		const content = ["# Comment 1", "# Comment 2", "; Comment 3", ""].join(
			"\n",
		);

		const result = parseIni(content);
		assert.strictEqual(result.sections.length, 0);
		assert.strictEqual(result.header.length, 4); // 3 comments + 1 empty line at end
	});
});
