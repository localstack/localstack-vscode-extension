import { homedir, platform } from "node:os";
import { join } from "node:path";

export const LOCAL_CLI_INSTALLATION_DIRNAME = join(
	homedir(),
	".local",
	"localstack",
);

const systemDrive = process.env.SystemDrive || "C:";
export const GLOBAL_CLI_INSTALLATION_DIRNAME = join(
	systemDrive,
	"Program Files",
	"localstack",
);

const CLI_UNIX_PATHS = [
	// The local installation path takes precedence.
	join(LOCAL_CLI_INSTALLATION_DIRNAME, "localstack"),
	// Check if it's in the PATH.
	"localstack",
	// Common installation paths.
	join("/", "usr", "bin", "localstack"),
	join("/", "usr", "local", "bin", "localstack"),
	join("/", "opt", "homebrew", "bin", "localstack"),
	join("/", "home", "linuxbrew", ".linuxbrew", "bin", "localstack"),
	join(homedir(), ".linuxbrew", "bin", "localstack"),
	join(homedir(), ".local", "bin", "localstack"),
];

const CLI_WINDOWS_PATHS = [
	// The local installation path takes precedence.
	join(LOCAL_CLI_INSTALLATION_DIRNAME, "localstack.exe"),
	// Check if it's in the PATH.
	"localstack.exe",
	// Common installation paths.
	join(GLOBAL_CLI_INSTALLATION_DIRNAME, "localstack", "localstack.exe"),
];

export const CLI_PATHS =
	platform() === "win32" ? CLI_WINDOWS_PATHS : CLI_UNIX_PATHS;

export const LOCALSTACK_DOCKER_IMAGE_NAME = "localstack/localstack-pro";
