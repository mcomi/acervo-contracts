import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';
import YAML from 'yaml';

let contract;
let frozen;
before(async () => {
    contract = YAML.parse(await readFile(new URL('../dist/openapi.yaml', import.meta.url), 'utf8'));
    frozen = JSON.parse(
        await readFile(new URL('./fixtures/acv-28-frozen-hashes.json', import.meta.url), 'utf8'),
    );
});
const stable = (value) =>
    Array.isArray(value)
        ? value.map(stable)
        : value !== null && typeof value === 'object'
          ? Object.fromEntries(
                Object.keys(value)
                    .sort()
                    .map((key) => [key, stable(value[key])]),
            )
          : value;
const digest = (value) =>
    createHash('sha256')
        .update(JSON.stringify(stable(value)))
        .digest('hex');
const resolve = (value) =>
    value.$ref
        ? value.$ref
              .split('/')
              .slice(1)
              .reduce((node, key) => node[key], contract)
        : value;
const input = (operation) => resolve(operation.requestBody.content['application/json'].schema);
const history = '/custody/containers/{containerId}/identification/changes';
const state = '/custody/containers/{containerId}/identification';

describe('Copies and identification', () => {
    it('should preserve every frozen ACV-28 endpoint and component', () => {
        for (const [path, expected] of Object.entries(frozen.paths))
            assert.equal(digest(contract.paths[path]), expected, path);
        for (const [kind, values] of Object.entries(frozen.components)) {
            for (const [name, expected] of Object.entries(values))
                assert.equal(digest(contract.components[kind][name]), expected, kind + '/' + name);
        }
    });

    it('should register copies with retry safety and catalogued vocabulary IDs', () => {
        const create = contract.paths['/catalog/works/{workId}/copies'].post;
        assert.equal(create['x-permission'], 'catalog.copies.write');
        assert.deepEqual(create['x-additional-permissions'], ['catalog.copies.read']);
        assert.ok(
            create.parameters
                .map(resolve)
                .some(
                    ({ name, required, schema }) =>
                        name === 'Idempotency-Key' && required && schema.format === 'uuid',
                ),
        );
        assert.deepEqual(input(create).required, ['family', 'formatId']);
        assert.deepEqual(Object.keys(input(create).properties), [
            'family',
            'formatId',
            'elementTypeId',
            'sourceCopyId',
            'notes',
        ]);
        assert.equal(input(create).additionalProperties, false);
        assert.ok(create.responses['201'].headers.ETag);
        assert.ok(create.responses['201'].headers.Location);
        assert.deepEqual(contract.components.schemas.CarrierFamily.enum, [
            'film',
            'magnetic',
            'optical',
            'digital',
        ]);
    });

    it('should use a versioned identification set and separate append-only history', () => {
        const changes = contract.paths[history];
        assert.deepEqual(Object.keys(changes).sort(), ['get', 'parameters', 'post']);
        assert.ok(contract.paths[state].get.responses['200'].headers.ETag);
        assert.ok(
            changes.post.parameters
                .map(resolve)
                .some(({ name, required }) => name === 'If-Match' && required),
        );
        assert.ok(changes.post.responses['412']);
        assert.ok(changes.post.responses['428']);
        assert.match(changes.post.responses['201'].description, /not the aggregate/);
        assert.deepEqual(contract.components.schemas.IdentificationAction.enum, [
            'identify',
            'correct',
            'remove',
        ]);
        assert.match(input(changes.post).description, /nonblank reason/);
        assert.equal(input(changes.post).additionalProperties, false);
        assert.deepEqual(Object.keys(input(changes.post).properties), [
            'action',
            'linkId',
            'copyId',
            'partLabel',
            'reason',
        ]);
        const evidence = contract.components.schemas.IdentificationChange;
        assert.ok(evidence.properties.before);
        assert.ok(evidence.properties.after);
        assert.ok(evidence.required.includes('actor'));
        assert.ok(evidence.required.includes('recordedAt'));
        assert.match(
            contract.components.schemas.IdentificationState.description,
            /at least one current active link/,
        );
    });

    it('should gate cross-module projections and provide independent paged physical links', () => {
        for (const path of [
            history,
            state,
            state + '/links',
            '/custody/works/{workId}/copy-placements',
        ]) {
            const read = contract.paths[path].get;
            assert.deepEqual(read['x-required-entitlements'], ['custody', 'locations', 'catalog']);
            assert.equal(read['x-permission'], 'custody.identifications.read');
            assert.deepEqual(read['x-additional-permissions'], [
                'locations.containers.read',
                'catalog.copies.read',
            ]);
        }
        assert.equal(contract.paths[history].post['x-permission'], 'custody.identifications.write');
        assert.ok(
            contract.paths[history].post['x-additional-permissions'].includes(
                'custody.identifications.read',
            ),
        );
        const placement = contract.components.schemas.CopyPlacement;
        assert.ok(placement.required.includes('location'));
        assert.ok(placement.properties.partLabel);
        assert.ok(!Object.hasOwn(placement.properties, 'fileUrl'));
        assert.ok(
            !Object.hasOwn(contract.components.schemas.CatalogCopy.properties, 'containerId'),
        );
    });

    it('should keep read-only selectable vocabulary separate from its versioned administration', () => {
        assert.equal(
            contract.paths['/catalog/copy-terms'].get['x-permission'],
            'catalog.copies.read',
        );
        const term = contract.paths['/catalog/copy-term-definitions/{termId}'];
        assert.equal(term.put['x-permission'], 'catalog.copy-vocabularies.manage');
        assert.ok(
            term.put.parameters
                .map(resolve)
                .some(({ name, required }) => name === 'If-Match' && required),
        );
        assert.deepEqual(Object.keys(input(term.put).properties), ['name', 'isActive']);
        assert.ok(!Object.hasOwn(term, 'delete'));
    });
});
