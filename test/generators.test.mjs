// Generates the Spring interfaces the API will implement, so a contract change that the Java
// generator mishandles fails here instead of in the API repo. Needs Java 11 or later.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const cache = new URL('.cache/', root);

const generatorVersion = '7.26.0';
// SHA-256 of the jar published on Maven Central; update it together with the version.
const generatorSha256 = '1760050094997b9cc790cc1350be095f15da8c08a996b184d3eadc4ccda5e35e';
const generatorJar = new URL(`openapi-generator-cli-${generatorVersion}.jar`, cache);
const generatorUrl = `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${generatorVersion}/openapi-generator-cli-${generatorVersion}.jar`;

// Warnings we accept; any other one fails the test so it gets a look.
const knownWarnings = ['OpenAPI 3.1 support is still in beta'];

const sources = new URL('spring/src/main/java/org/acervo/api/', cache);
let generatorOutput = '';

async function ensureGenerator() {
    if (!existsSync(generatorJar)) {
        const response = await fetch(generatorUrl);
        assert.ok(response.ok, `Download failed: ${String(response.status)}`);
        await mkdir(cache, { recursive: true });
        await writeFile(generatorJar, Buffer.from(await response.arrayBuffer()));
    }
    const digest = createHash('sha256')
        .update(await readFile(generatorJar))
        .digest('hex');
    assert.equal(digest, generatorSha256, 'Generator jar checksum mismatch');
}

before(async () => {
    await ensureGenerator();
    await rm(new URL('spring/', cache), { recursive: true, force: true });
    const { stdout, stderr } = await run(
        'java',
        [
            '-jar',
            generatorJar.pathname,
            'generate',
            '--input-spec',
            'dist/openapi.yaml',
            '--generator-name',
            'spring',
            '--output',
            '.cache/spring',
            '--additional-properties',
            [
                'interfaceOnly=true',
                'useSpringBoot4=true',
                'useJackson3=true',
                'useTags=true',
                'openApiNullable=false',
                'skipDefaultInterface=true',
                'documentationProvider=none',
                'generateJsonIncludeAnnotations=false',
                'generateJsonSetterNullsAnnotations=false',
                'apiPackage=org.acervo.api',
                'modelPackage=org.acervo.api.model',
                'configPackage=org.acervo.api.configuration',
            ].join(','),
        ],
        { cwd: root, maxBuffer: 10 * 1024 * 1024 },
    );
    generatorOutput = stdout + stderr;
});

describe('Spring generator', () => {
    it('should generate without unknown warnings or errors', () => {
        const problems = generatorOutput
            .split('\n')
            .filter((line) => / (WARN|ERROR) /.test(line))
            .filter((line) => !knownWarnings.some((known) => line.includes(known)));

        assert.deepEqual(problems, []);
    });

    it('should generate one interface per module tag', () => {
        assert.ok(existsSync(new URL('PlatformApi.java', sources)));
        assert.ok(existsSync(new URL('CatalogApi.java', sources)));
        assert.ok(existsSync(new URL('InventoryApi.java', sources)));
        assert.ok(existsSync(new URL('LabApi.java', sources)));
        assert.ok(existsSync(new URL('LocationsApi.java', sources)));
        assert.ok(existsSync(new URL('CustodyApi.java', sources)));
    });

    it('should generate Jackson 3 databind annotations for Spring Boot 4', async () => {
        const model = await readFile(new URL('model/Work.java', sources), 'utf8');
        assert.ok(model.includes('tools.jackson.databind.annotation.JsonDeserialize'));
        assert.ok(!model.includes('com.fasterxml.jackson.databind'));
    });

    it('should type sort parameters as enums', async () => {
        const catalogApi = await readFile(new URL('CatalogApi.java', sources), 'utf8');

        assert.match(catalogApi, /WorksSortField sort/);
    });

    it('should require If-Match on writes', async () => {
        const catalogApi = await readFile(new URL('CatalogApi.java', sources), 'utf8');

        assert.equal(
            catalogApi.match(/@RequestHeader\(value = "If-Match", required = true\)/g)?.length,
            2,
        );
    });
    it('should generate a required idempotency header and typed conflict models', async () => {
        const custody = await readFile(new URL('CustodyApi.java', sources), 'utf8');
        assert.match(custody, /@RequestHeader\(value = "Idempotency-Key", required = true\)/);
        const conflict = await readFile(
            new URL('model/ContainerCodeTakenProblem.java', sources),
            'utf8',
        );
        assert.match(conflict, /UUID existingContainerId/);
        assert.ok(existsSync(new URL('model/IdempotencyKeyReusedProblem.java', sources)));
    });
});

// Administrative operations extend the existing module interfaces; consumers still own their
// implementation. Verify the generated API rather than relying only on YAML review.
describe('Reference data Spring generation', () => {
    it('should generate versioned administration and a non-reserving code preview', async () => {
        const locations = await readFile(new URL('LocationsApi.java', sources), 'utf8');
        const platform = await readFile(new URL('PlatformApi.java', sources), 'utf8');
        assert.match(locations, /createLocationDefinition\(/);
        assert.match(locations, /replaceContainerTypeDefinition\(/);
        assert.match(locations, /getGeneratedCodePreview\(/);
        assert.match(locations, /createGeneratedCodeFormat\(/);
        assert.match(platform, /replaceAreaDefinition\(/);
        assert.match(locations, /@RequestHeader\(value = "If-Match", required = true\)/);
        const location = await readFile(
            new URL('model/LocationDefinitionUpdateInput.java', sources),
            'utf8',
        );
        assert.match(location, /Boolean isNiche/);
        assert.match(location, /Boolean isActive/);
        assert.ok(!location.includes('String code;'));
        assert.ok(!location.includes('UUID parentId;'));
    });
});
