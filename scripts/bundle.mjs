// Bundles the multi-file contract into dist/openapi.yaml, the file consumers vendor, and stamps
// it with the package version so every copy says which release it is.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { bundle, createConfig } from '@redocly/openapi-core';
import { stringify } from 'yaml';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

const { bundle: result, problems } = await bundle({
    ref: new URL('openapi/openapi.yaml', root).pathname,
    config: await createConfig({}),
});

if (problems.length > 0) {
    for (const problem of problems) {
        console.error(`${problem.severity}: ${problem.message}`);
    }
    process.exit(1);
}

const document = result.parsed;
document.info.version = version;

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/openapi.yaml', root), stringify(document, { lineWidth: 0 }));
console.log(`Bundled contract ${version} into dist/openapi.yaml`);
