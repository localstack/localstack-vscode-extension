import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { configureAwsProfiles } from "../utils/configure-aws.ts";

const TEST_AWS_DIRECTORY = path.join(
	os.homedir(),
	`.test-dummy-aws-${Math.floor(100000 + Math.random() * 900000)}`,
);

async function cleanUp(): Promise<void> {
	await fs.promises.rm(TEST_AWS_DIRECTORY, { recursive: true, force: true });
}

suite("Configure AWS Test Suite", () => {
	test("profile files don't exist", async () => {
		const configFilePath = path.join(TEST_AWS_DIRECTORY, "config");
		const credentialsFilePath = path.join(TEST_AWS_DIRECTORY, "credentials");
		assert.strictEqual(fs.existsSync(configFilePath), false);
		assert.strictEqual(fs.existsSync(credentialsFilePath), false);

		await configureAwsProfiles({
			awsDirectory: TEST_AWS_DIRECTORY,
			forceOverride: true,
		});

		assert.strictEqual(fs.existsSync(configFilePath), true);
		assert.strictEqual(fs.existsSync(credentialsFilePath), true);

		const configContent = fs.readFileSync(configFilePath, "utf-8");
		const credentialsContent = fs.readFileSync(credentialsFilePath, "utf-8");

		const configExpected = [
			"[profile localstack]",
			"region = us-east-1",
			"output = json",
			"endpoint_url = http://localhost.localstack.cloud:4566",
			"",
		].join("\n");
		assert.strictEqual(configContent, configExpected);

		const credentialsExpected = [
			"[localstack]",
			"aws_access_key_id = test",
			"aws_secret_access_key = test",
			"",
		].join("\n");

		assert.strictEqual(credentialsContent, credentialsExpected);

		// Clean up after test
		await cleanUp();
	});

	test("should add localstack profile to existing AWS config files ", async () => {
		const configFilePath = path.join(TEST_AWS_DIRECTORY, "config");
		const credentialsFilePath = path.join(TEST_AWS_DIRECTORY, "credentials");

		// Create profile files and a default aws profile if it doesn't exist
		fs.mkdirSync(TEST_AWS_DIRECTORY, { recursive: true });
		fs.writeFileSync(
			configFilePath,
			"[default]\nregion = us-west-2\n# Important comment\noutput = json\n; another comment\n",
		);
		fs.writeFileSync(
			credentialsFilePath,
			"[default]\naws_access_key_id = default_key\naws_secret_access_key = default_secret\n",
		);

		await configureAwsProfiles({
			awsDirectory: TEST_AWS_DIRECTORY,
			forceOverride: true,
		});

		assert.strictEqual(fs.existsSync(configFilePath), true);
		assert.strictEqual(fs.existsSync(credentialsFilePath), true);

		const configContent = fs.readFileSync(configFilePath, "utf-8");
		const credentialsContent = fs.readFileSync(credentialsFilePath, "utf-8");

		const configExpected = [
			"[default]",
			"region = us-west-2",
			"# Important comment",
			"output = json",
			"; another comment",
			"",
			"[profile localstack]",
			"region = us-east-1",
			"output = json",
			"endpoint_url = http://localhost.localstack.cloud:4566",
			"",
		].join("\n");
		assert.strictEqual(configContent, configExpected);

		const credentialsExpected = [
			"[default]",
			"aws_access_key_id = default_key",
			"aws_secret_access_key = default_secret",
			"",
			"[localstack]",
			"aws_access_key_id = test",
			"aws_secret_access_key = test",
			"",
		].join("\n");
		assert.strictEqual(credentialsContent, credentialsExpected);

		// Clean up after test
		await cleanUp();
	});

	test("should update existing localstack profile with expected format", async () => {
		const configFilePath = path.join(TEST_AWS_DIRECTORY, "config");
		const credentialsFilePath = path.join(TEST_AWS_DIRECTORY, "credentials");

		// Create initial localstack profile
		fs.mkdirSync(TEST_AWS_DIRECTORY, { recursive: true });
		fs.writeFileSync(
			configFilePath,
			"[profile localstack]\nregion = us-east-1\noutput = json\n",
		);
		fs.writeFileSync(
			credentialsFilePath,
			"[localstack]\naws_access_key_id = test\naws_secret_access_key = test\n",
		);

		await configureAwsProfiles({
			awsDirectory: TEST_AWS_DIRECTORY,
			forceOverride: true,
		});

		assert.strictEqual(fs.existsSync(configFilePath), true);
		assert.strictEqual(fs.existsSync(credentialsFilePath), true);

		const configContent = fs.readFileSync(configFilePath, "utf-8");
		const credentialsContent = fs.readFileSync(credentialsFilePath, "utf-8");

		const configExpected = [
			"[profile localstack]",
			"region = us-east-1",
			"output = json",
			"",
			"endpoint_url = http://localhost.localstack.cloud:4566", // missing in original
			"",
		].join("\n");
		assert.strictEqual(configContent, configExpected);

		const credentialsExpected = [
			"[localstack]",
			"aws_access_key_id = test",
			"aws_secret_access_key = test",
			"",
		].join("\n");
		assert.strictEqual(credentialsContent, credentialsExpected);

		// Clean up after test
		await cleanUp();
	});
});
