import { mkdir, open, rm, symlink, appendFile } from "node:fs/promises";
import os, { homedir } from "node:os";
import path, { join } from "node:path";

import { move } from "fs-extra/esm";
import { window } from "vscode";
import type { CancellationToken, LogOutputChannel, Progress } from "vscode";
import * as z from "zod/v4-mini";

import {
	GLOBAL_CLI_INSTALLATION_DIRNAME,
	LOCAL_CLI_INSTALLATION_DIRNAME,
} from "../constants.ts";

import { execLocalStack } from "./cli.ts";
import { exec } from "./exec.ts";
import { minDelay } from "./promises.ts";
import {
	spawnElevatedDarwin,
	spawnElevatedLinux,
	spawnElevatedWindows,
} from "./prompts.ts";
import { spawn } from "./spawn.ts";
import type { Telemetry } from "./telemetry.ts";

export async function checkLocalstackInstalled(
	outputChannel: LogOutputChannel,
): Promise<boolean> {
	try {
		await execLocalStack(["--version"], { outputChannel });
		return true;
	} catch (error) {
		return false;
	}
}

export async function runInstallProcess(
	progress: Progress<{ message: string }>,
	cancellationToken: CancellationToken,
	outputChannel: LogOutputChannel,
	telemetry: Telemetry,
	origin?: "extension_startup" | "manual_trigger",
): Promise<{ cancelled: boolean; skipped?: boolean }> {
	/////////////////////////////////////////////////////////////////////
	const origin_trigger = origin ? origin : "manual_trigger";
	progress.report({
		message: "Verifying CLI installation...",
	});
	const startedAt = new Date().toISOString();
	const isLocalStackInstalled = await minDelay(
		checkLocalstackInstalled(outputChannel),
	);
	if (cancellationToken.isCancellationRequested) {
		return { cancelled: true };
	}

	/////////////////////////////////////////////////////////////////////
	if (isLocalStackInstalled) {
		progress.report({
			message: "Skipping CLI installation...",
		});
		telemetry.track({
			name: "emulator_installed",
			payload: {
				namespace: "onboarding",
				origin: origin_trigger,
				step_order: 1,
				started_at: startedAt,
				ended_at: new Date().toISOString(),
				status: "SKIPPED",
			},
		});
		await minDelay();
		return { cancelled: false, skipped: true };
	}

	/////////////////////////////////////////////////////////////////////
	progress.report({ message: "Downloading latest CLI release..." });
	const downloadURL = await getCLIDownloadURL();

	return await withTempDir<{ cancelled: boolean }>(async (temporaryDirname) => {
		await minDelay(
			downloadAndUnarchive(downloadURL, temporaryDirname, outputChannel),
		);

		const platform = os.platform();

		/////////////////////////////////////////////////////////////////////
		progress.report({
			message: "Choose installation scope...",
		});

		const installScope = await window.showInformationMessage(
			"Choose a LocalStack CLI installation scope",
			{
				modal: true,
			},

			{
				title: "Install for current user only",
				value: "local",
			},
			{
				title: "Install for all users",
				value: "global",
			},
		);

		if (!installScope) {
			window.showErrorMessage("The installation was cancelled by the user");
			return { cancelled: true };
		}

		if (installScope.value === "global") {
			/////////////////////////////////////////////////////////////////////
			progress.report({
				message: "Waiting for elevated privileges...",
			});

			switch (platform) {
				case "darwin":
					await installGlobalDarwin(
						progress,
						cancellationToken,
						outputChannel,
						temporaryDirname,
					);
					break;
				case "linux":
					await installGlobalLinux(
						progress,
						cancellationToken,
						outputChannel,
						temporaryDirname,
					);
					break;
				case "win32":
					await installGlobalWindows(
						progress,
						cancellationToken,
						outputChannel,
						temporaryDirname,
					);
					break;
				default:
					telemetry.track({
						name: "emulator_installed",
						payload: {
							namespace: "onboarding",
							origin: origin_trigger,
							step_order: 1,
							started_at: startedAt,
							ended_at: new Date().toISOString(),
							status: "FAILED",
							installation_scope: "GLOBAL",
							errors: [`Unsupported platform: ${platform}`],
						},
					});
					throw new Error(`Unsupported platform: ${platform}`);
			}
		} else if (installScope.value === "local") {
			/////////////////////////////////////////////////////////////////////
			progress.report({
				message: "Installing LocalStack CLI for current user...",
			});
			switch (platform) {
				case "darwin":
				case "linux":
					await installLocalDarwinLinux(temporaryDirname);
					break;
				case "win32":
					await installLocalWindows(temporaryDirname);
					break;
				default:
					telemetry.track({
						name: "emulator_installed",
						payload: {
							namespace: "onboarding",
							origin: origin_trigger,
							step_order: 1,
							started_at: startedAt,
							ended_at: new Date().toISOString(),
							status: "FAILED",
							installation_scope: "LOCAL",
							errors: [`Unsupported platform: ${platform}`],
						},
					});
					throw new Error(`Unsupported platform: ${platform}`);
			}
		}

		telemetry.track({
			name: "emulator_installed",
			payload: {
				namespace: "onboarding",
				origin: origin_trigger,
				step_order: 1,
				started_at: startedAt,
				ended_at: new Date().toISOString(),
				status: "COMPLETED",
				installation_scope: installScope?.value,
			},
		});

		return {
			cancelled: false,
		};
	});
}

/**
 * Zod schema for a single asset in a GitHub release.
 */
const AssetSchema = z.object({
	name: z.string(),
	browser_download_url: z.url(),
});

/**
 * Zod schema for the GitHub release API response.
 */
const ReleaseSchema = z.object({
	tag_name: z.string(),
	assets: z.array(AssetSchema),
});

type ReleaseSchema = z.infer<typeof ReleaseSchema>;

/**
 * Fetches the latest LocalStack CLI release and returns download links for each OS/arch.
 * @throws If the fetch fails or the response is invalid.
 */
async function fetchLatestCLIRelease(): Promise<ReleaseSchema> {
	const res = await fetch(
		"https://api.github.com/repos/localstack/localstack-cli/releases/latest",
		{
			headers: {
				Accept: "application/vnd.github+json",
			},
		},
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch release: ${res.status} ${res.statusText}`);
	}
	const data = await res.json();
	const parsed = ReleaseSchema.safeParse(data);
	if (!parsed.success) {
		console.error(z.treeifyError(parsed.error));
		throw new Error("Invalid GitHub release response");
	}

	return parsed.data;
}

/**
 * Detects the host OS and architecture in a format matching LocalStack CLI asset names.
 * @returns {string} The platform, e.g. "darwin-arm64", "linux-amd64", "windows-amd64"
 */
function detectPlatform(): string {
	const platform = os.platform();
	const arch = os.arch();

	let osPart: string;
	switch (platform) {
		case "darwin":
			osPart = "darwin";
			break;
		case "win32":
			osPart = "windows";
			break;
		case "linux":
			osPart = "linux";
			break;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

	let archPart: string;
	switch (arch) {
		case "x64":
			archPart = "amd64";
			break;
		case "arm64":
			archPart = "arm64";
			break;
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}

	return `${osPart}-${archPart}`;
}

async function getCLIDownloadURL(): Promise<string> {
	const platform = detectPlatform();
	const release = await fetchLatestCLIRelease();
	const version = release.tag_name.slice(1);
	const asset = release.assets.find(
		(asset) =>
			asset.name === `localstack-cli-${version}-${platform}.tar.gz` ||
			asset.name === `localstack-cli-${version}-${platform}.zip`,
	);
	const url = asset?.browser_download_url;
	if (!url) {
		throw new Error("Download URL not found");
	}
	return url;
}

/**
 * Options for downloading a file.
 */
interface DownloadFileOptions {
	/** The URL to download from. */
	url: string;
	/** The full destination file path to write to. */
	destinationFilename: string;
}

/**
 * Downloads a file from a URL to a specified destination path.
 * @param options The download options.
 * @returns The full path to the downloaded file.
 * @throws If the download fails.
 */
async function downloadFile(options: DownloadFileOptions): Promise<string> {
	const { url, destinationFilename: destinationPath } = options;
	const res = await fetch(url);

	if (!res.ok || !res.body) {
		throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
	}

	// Create a writable stream to the destination path
	const fileHandle = await open(destinationPath, "w");
	try {
		const writable = fileHandle.createWriteStream();

		await new Promise<void>((resolve, reject) => {
			const reader = res.body?.getReader();

			function pump() {
				reader
					?.read()
					.then(({ done, value }) => {
						if (done) {
							writable.end();
							resolve();
							return;
						}
						writable.write(value, pump);
					})
					.catch(reject);
			}

			writable.on("error", reject);
			pump();
		});
	} finally {
		await fileHandle.close();
	}

	return destinationPath;
}

async function downloadAndUnarchive(
	url: string,
	destinationDirname: string,
	outputChannel: LogOutputChannel,
) {
	const extension = url.endsWith(".tar.gz") ? "tar.gz" : "zip";

	const archiveFilename = `${destinationDirname}/cli.${extension}`;

	await minDelay(async () => {
		await downloadFile({
			url,
			destinationFilename: archiveFilename,
		});

		await unarchive(archiveFilename, destinationDirname, outputChannel);
	});
}

/**
 * Extracts a .tar.gz or .zip archive to the specified destination directory.
 * @param archiveFilename The path to the archive file.
 * @param destinationDirname The directory to extract to.
 * @returns The destination directory.
 * @throws If the file type is unsupported or extraction fails.
 */
async function unarchive(
	archiveFilename: string,
	destinationDirname: string,
	outputChannel: LogOutputChannel,
): Promise<string> {
	await mkdir(destinationDirname, { recursive: true });

	await spawn("tar", ["-xzf", archiveFilename, "-C", destinationDirname], {
		outputLabel: "tar",
		outputChannel,
	});

	return destinationDirname;
}

/**
 * Creates a temporary directory, runs a callback, and ensures cleanup.
 * @param callback Function that receives the temp dir path.
 */
async function withTempDir<T>(
	callback: (tmpPath: string) => Promise<T>,
): Promise<T> {
	const tempDirPath = join(
		homedir(),
		".localstack",
		`localstack-temp-install-${Math.random().toString(36).substring(0, 5)}`,
	);
	await mkdir(tempDirPath, { recursive: true });
	try {
		return await callback(tempDirPath);
	} finally {
		// Remove the directory and its contents recursively
		await rm(tempDirPath, { recursive: true, force: true });
	}
}

async function ensureLocalBinInPath() {
	try {
		const homeDir = os.homedir();
		const dotLocalstackDir = ".localstack";
		const profileSetupScriptName = "localstack_setup.sh";
		const setupScriptPath = path.join(
			homeDir,
			dotLocalstackDir,
			profileSetupScriptName,
		);
		const setupScriptContent = `
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
	export PATH="$HOME/.local/bin:$PATH"
fi
`.trim();
		await mkdir(path.join(homeDir, ".localstack"), { recursive: true });
		const fh = await open(setupScriptPath, "w");
		await fh.writeFile(setupScriptContent);
		await fh.close();

		const shellPath = process.env.SHELL || "";
		// biome-ignore format: auto-formatting makes the ternary unreadable
		const profileFile = 
			shellPath.endsWith("zsh") ? path.join(homeDir, ".zshrc") :
			shellPath.endsWith("bash") ? path.join(homeDir, ".bashrc") :
			"";

		const sourceLocalstackInShellProfile = `source $HOME/${dotLocalstackDir}/${profileSetupScriptName}`;

		if (profileFile) {
			const profileContent = await open(profileFile, "r").then(async (fh) => {
				try {
					return await fh.readFile({ encoding: "utf8" }); // will throw if file doesn't exist, in this case we just show info message and don't create any profile files as that would be too intrusive
				} finally {
					await fh.close();
				}
			});
			if (!profileContent.includes(sourceLocalstackInShellProfile)) {
				await appendFile(
					profileFile,
					`\n# Added by LocalStack installer\n${sourceLocalstackInShellProfile}\n`,
				);
				window.showInformationMessage(
					`Updated your shell profile (${profileFile}) to include ~/.local/bin in PATH. Restart your terminal to apply changes.`,
				);
			}
		} else {
			window.showInformationMessage(
				`Could not detect your shell profile. To use localstack CLI from terminal ensure ~/.local/bin is in your PATH.`,
			);
		}
	} catch (err) {
		window.showInformationMessage(
			`Could not update your shell profile. To use localstack CLI from terminal ensure ~/.local/bin is in your PATH.`,
		);
	}
}

async function installLocalDarwinLinux(temporaryDirname: string) {
	const homeDir = os.homedir();
	const localstackBinary = `${LOCAL_CLI_INSTALLATION_DIRNAME}/localstack`;
	const localBinDir = `${homeDir}/.local/bin`;
	const symlinkToBinary = `${localBinDir}/localstack`;

	// Ensure ~/.local/bin exists
	await mkdir(localBinDir, { recursive: true });

	// Remove old files if present
	await rm(symlinkToBinary, { force: true }).catch(() => {});
	await rm(LOCAL_CLI_INSTALLATION_DIRNAME, {
		recursive: true,
		force: true,
	}).catch(() => {});

	// Move binary to ~/.local/localstack/localstack
	// using move from fs-extra for better compatibility with linux as temp dir and user home can be on different filesystems
	await move(`${temporaryDirname}/localstack`, LOCAL_CLI_INSTALLATION_DIRNAME);

	// Create symlink ~/.local/bin/localstack -> ~/.local/localstack/localstack
	await symlink(localstackBinary, symlinkToBinary);

	await ensureLocalBinInPath();

	window.showInformationMessage("LocalStack CLI installed for current user.");
}

async function installLocalWindows(temporaryDirname: string) {
	await rm(LOCAL_CLI_INSTALLATION_DIRNAME, { recursive: true, force: true });
	await move(`${temporaryDirname}/localstack`, LOCAL_CLI_INSTALLATION_DIRNAME);
	await exec(`setx PATH "%PATH%;${LOCAL_CLI_INSTALLATION_DIRNAME}"`);

	// // Update PATH for current process (setx only updates for new processes, including vscode)
	// process.env.PATH = `${process.env.PATH};${CLI_INSTALLATION_DIRNAME}`;

	window.showInformationMessage("LocalStack CLI installed for current user.");
}

async function installGlobalDarwin(
	progress: Progress<{ message: string }>,
	cancellationToken: CancellationToken,
	outputChannel: LogOutputChannel,
	temporaryDirname: string,
) {
	// Use elevated privileges to install globally on macOS

	const { cancelled } = await spawnElevatedDarwin({
		//TODO consider loading script from a file
		script: `rm -rf /usr/local/localstack && mv ${temporaryDirname}/localstack /usr/local/localstack && ln -sf /usr/local/localstack/localstack /usr/local/bin/localstack`,
		outputChannel,
		outputLabel: "install",
		cancellationToken,
	});
	if (cancelled) {
		//TODO check if progress can be used instead of window
		window.showErrorMessage("The installation was cancelled by the user");
		return { cancelled: true };
	}
}

async function installGlobalLinux(
	progress: Progress<{ message: string }>,
	cancellationToken: CancellationToken,
	outputChannel: LogOutputChannel,
	temporaryDirname: string,
) {
	// Use elevated privileges to install globally on linux

	const { cancelled } = await spawnElevatedLinux({
		//TODO consider loading script from a file
		script: `rm -rf /usr/local/localstack && mv ${temporaryDirname}/localstack /usr/local/localstack && ln -sf /usr/local/localstack/localstack /usr/local/bin/localstack`,
		outputChannel,
		outputLabel: "install",
		cancellationToken,
	});
	if (cancelled) {
		//TODO check if progress can be used instead of window
		window.showErrorMessage("The installation was cancelled by the user");
		return { cancelled: true };
	}
}

async function installGlobalWindows(
	progress: Progress<{ message: string }>,
	cancellationToken: CancellationToken,
	outputChannel: LogOutputChannel,
	temporaryDirName: string,
) {
	const localstackExecutableDir = path.join(
		GLOBAL_CLI_INSTALLATION_DIRNAME,
		"localstack",
	);

	// Run installation commands with elevated permissions on Windows
	// TODO remove extra verbosity added during debug
	const installScript = `
        Write-Host "=== INSTALLATION STARTED ==="

        $localstackPath = '${GLOBAL_CLI_INSTALLATION_DIRNAME}';
		$localstackExecutableDir = '${localstackExecutableDir}';
        Write-Host "Source temp dir: '${temporaryDirName}'"
		Write-Host "Target path: $localstackPath"
		Write-Host "Localstack executable dir: $localstackExecutableDir"

        # 1. Remove directory if it exists
        if (Test-Path $localstackPath) {
          Write-Host "Removing existing directory..."
          Remove-Item -LiteralPath $localstackPath -Recurse -Force -ErrorAction Stop
        } else {
          Write-Host "No existing directory to remove."
        }

        # 2. Move directory from temp to target
        if (Test-Path '${temporaryDirName}') {
          Write-Host "Moving '${temporaryDirName}' to $localstackPath..."
          Move-Item -LiteralPath '${temporaryDirName}' -Destination $localstackPath -ErrorAction Stop
        } else {
          Write-Host "ERROR: Temp directory not found - cannot move." -ForegroundColor Red
          exit 1
        }

        # 3. Add to PATH if missing
        $currentPath = [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::Machine)
        Write-Host "Current PATH: $currentPath"
		if (-not ($currentPath.Split(';') -contains $localstackExecutableDir)) {
          Write-Host "Updating system PATH..."
          $newPath = "\${currentPath};\${localstackExecutableDir}"
          [Environment]::SetEnvironmentVariable('Path', $newPath, [EnvironmentVariableTarget]::Machine)
          Write-Host "PATH updated."
        } else {
          Write-Host "Path already contains $localstackExecutableDir"
        }

        Write-Host "=== INSTALLATION COMPLETED SUCCESSFULLY ==="
      `;

	await spawnElevatedWindows({
		script: installScript,
		outputChannel,
		outputLabel: "install",
		cancellationToken,
	});

	window.showInformationMessage(
		"LocalStack CLI installed globally for all users.",
	);
}
