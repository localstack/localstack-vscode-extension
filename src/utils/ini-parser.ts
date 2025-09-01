/**
 * Minimal INI parser that preserves comments and formatting
 * Supports AWS config and credentials file formats
 */

export interface IniSection {
	name: string;
	properties: Record<string, string>;
	lines: string[]; // Original lines including comments and formatting
}

export interface IniFile {
	sections: IniSection[];
	header: string[]; // Lines before first section (comments, blank lines)
}

/**
 * Parses an INI file content while preserving comments and formatting
 */
export function parseIni(content: string): IniFile {
	const lines = content.split("\n");
	const sections: IniSection[] = [];
	const header: string[] = [];

	let currentSection: IniSection | null = null;
	let inHeader = true;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Section header: [section] or [profile section]
		if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
			// Save current section if exists
			if (currentSection) {
				sections.push(currentSection);
			}

			inHeader = false;
			const sectionHeader = trimmedLine.slice(1, -1); // Remove [ ]

			currentSection = {
				name: sectionHeader,
				properties: {},
				lines: [line],
			};
		}
		// Property line: key = value
		else if (
			trimmedLine.includes("=") &&
			currentSection &&
			!trimmedLine.startsWith("#") &&
			!trimmedLine.startsWith(";")
		) {
			const [key, ...valueParts] = trimmedLine.split("=");
			const value = valueParts.join("=").trim();
			currentSection.properties[key.trim()] = value;
			currentSection.lines.push(line);
		}
		// Comment or blank line
		else {
			if (inHeader) {
				header.push(line);
			} else if (currentSection) {
				currentSection.lines.push(line);
			} else {
				header.push(line);
			}
		}
	}

	// Add final section if exists
	if (currentSection) {
		sections.push(currentSection);
	}

	return { sections, header };
}

/**
 * Serializes an IniFile back to string format, preserving comments and formatting
 */
export function serializeIni(iniFile: IniFile): string {
	const result: string[] = [];

	// Add header lines
	result.push(...iniFile.header);

	// Add sections
	for (let i = 0; i < iniFile.sections.length; i++) {
		const section = iniFile.sections[i];

		// Add blank line before section (except first if header exists)
		if (i > 0 || iniFile.header.length > 0) {
			// Only add blank line if the last line isn't already blank
			const lastLine = result[result.length - 1];
			if (lastLine !== undefined && lastLine.trim() !== "") {
				result.push("");
			}
		}

		result.push(...section.lines);
	}

	return result.join("\n");
}

/**
 * Updates or adds a section in the INI file
 */
export function updateIniSection(
	iniFile: IniFile,
	sectionName: string,
	properties: Record<string, string>,
): IniFile {
	const existingIndex = iniFile.sections.findIndex(
		(s) => s.name === sectionName,
	);

	if (existingIndex >= 0) {
		// Update existing section
		const existingSection = iniFile.sections[existingIndex];
		const updatedLines: string[] = [];
		const updatedProperties = { ...existingSection.properties };

		// Track which properties we've updated
		const updatedKeys = new Set<string>();

		// Go through existing lines and update properties
		for (const line of existingSection.lines) {
			const trimmedLine = line.trim();

			if (trimmedLine.startsWith("[")) {
				// Section header
				updatedLines.push(line);
			} else if (
				trimmedLine.includes("=") &&
				!trimmedLine.startsWith("#") &&
				!trimmedLine.startsWith(";")
			) {
				// Property line
				const [key] = trimmedLine.split("=");
				const cleanKey = key.trim();

				if (cleanKey in properties) {
					// Update this property
					const indentation = line.match(/^\s*/)?.[0] || "";
					updatedLines.push(
						`${indentation}${cleanKey} = ${properties[cleanKey]}`,
					);
					updatedProperties[cleanKey] = properties[cleanKey];
					updatedKeys.add(cleanKey);
				} else {
					// Keep existing property
					updatedLines.push(line);
				}
			} else {
				// Comment or blank line
				updatedLines.push(line);
			}
		}

		// Add any new properties at the end of the section
		for (const [key, value] of Object.entries(properties)) {
			if (!updatedKeys.has(key)) {
				updatedLines.push(`${key} = ${value}`);
				updatedProperties[key] = value;
			}
		}

		// Update the section
		const updatedSections = [...iniFile.sections];
		updatedSections[existingIndex] = {
			name: sectionName,
			properties: updatedProperties,
			lines: updatedLines,
		};

		return {
			...iniFile,
			sections: updatedSections,
		};
	} else {
		// Add new section
		const newSection: IniSection = {
			name: sectionName,
			properties: { ...properties },
			lines: [
				`[${sectionName}]`,
				...Object.entries(properties).map(
					([key, value]) => `${key} = ${value}`,
				),
			],
		};

		return {
			...iniFile,
			sections: [...iniFile.sections, newSection],
		};
	}
}
