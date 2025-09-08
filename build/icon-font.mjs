// DANGER: This file is ignored because it requires the "webfont" package, which has
// been compromised to some extent through https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised.

// import fs from "node:fs/promises";
// import path from "node:path";

// import { webfont } from "webfont";

// const svgsDir = path.resolve(`${import.meta.dirname}/../resources/icons`);
// const svgs = await fs
// 	.readdir(svgsDir)
// 	.then((files) => files.filter((file) => file.endsWith(".svg")))
// 	.then((files) => files.map((file) => `${svgsDir}/${file}`));

// const dest = `${import.meta.dirname}/../resources/fonts/localstack.woff`;

// async function generateFont() {
// 	try {
// 		const result = await webfont({
// 			files: svgs,
// 			formats: ["woff"],
// 			startUnicode: 0xe000,
// 			normalize: true,
// 			sort: false,
// 		});
// 		await fs.mkdir(path.dirname(dest), { recursive: true });
// 		await fs.writeFile(dest, result.woff, "binary");
// 		console.log(`Font created at ${path.relative(process.cwd(), dest)}`);
// 	} catch (error) {
// 		console.error("Font creation failed.", error);
// 	}
// }

// await generateFont();
