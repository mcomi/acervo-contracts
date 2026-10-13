import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { before, describe, it } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
let findings = [];

function findingsFor(rule) {
    return findings.filter((finding) => finding.code === rule);
}

before(async () => {
    // Spectral exits non-zero when it finds problems, which is the point here.
    const output = await run(
        'pnpm',
        ['exec', 'spectral', 'lint', 'test/fixtures/invalid-contract.yaml', '--format', 'json'],
        { cwd: new URL('../', import.meta.url) },
    ).catch((error) => error);
    findings = JSON.parse(output.stdout);
});

describe('Acervo lint rules', () => {
    it('should reject an operationId that is not camelCase', () => {
        assert.deepEqual(
            findingsFor('acervo-operation-id-camel-case').map((finding) => finding.path.join('.')),
            ['paths./catalog/works.get.operationId'],
        );
    });

    it('should reject a path segment that is not kebab-case', () => {
        assert.deepEqual(
            findingsFor('acervo-path-segments-kebab-case').map((finding) => finding.path.at(-1)),
            ['/catalog/workItems'],
        );
    });

    it('should reject a property that is not camelCase', () => {
        assert.equal(findingsFor('acervo-properties-camel-case').length, 1);
        assert.equal(findingsFor('acervo-properties-camel-case')[0].path.at(-1), 'work_title');
    });

    it('should reject an error response that is not problem+json', () => {
        assert.deepEqual(
            findingsFor('acervo-errors-are-problem-json').map((finding) => finding.path.join('.')),
            ['paths./catalog/works/{workId}.get.responses.404.content'],
        );
    });

    it('should reject an operation without x-permission', () => {
        assert.deepEqual(
            findingsFor('acervo-operation-declares-permission').map((finding) =>
                finding.path.join('.'),
            ),
            ['paths./catalog/works/{workId}.delete'],
        );
    });

    it('should reject a parameter that names the organization', () => {
        assert.equal(findingsFor('acervo-no-tenant-in-requests').length, 1);
    });

    it('should reject an operation with more than one tag', () => {
        assert.deepEqual(
            findingsFor('acervo-single-module-tag').map((finding) => finding.path.join('.')),
            ['paths./catalog/works/{workId}.delete.tags'],
        );
    });
});
