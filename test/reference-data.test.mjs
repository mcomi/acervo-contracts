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
        await readFile(new URL('./fixtures/acv-25-frozen-hashes.json', import.meta.url), 'utf8'),
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
const definitions = [
    [
        '/locations/location-definitions',
        'LocationDefinition',
        'locationId',
        'locations.references.manage',
    ],
    [
        '/locations/container-type-definitions',
        'ContainerTypeDefinition',
        'containerTypeId',
        'locations.references.manage',
    ],
    ['/platform/area-definitions', 'AreaDefinition', 'areaId', 'platform.areas.manage'],
];
const inputFor = (operation) => resolve(operation.requestBody.content['application/json'].schema);

describe('Reference data candidate', () => {
    it('should leave every ACV-25 path and existing component structurally unchanged', () => {
        for (const [path, expected] of Object.entries(frozen.paths))
            assert.equal(digest(contract.paths[path]), expected, path);
        for (const [kind, values] of Object.entries(frozen.components)) {
            for (const [name, expected] of Object.entries(values))
                assert.equal(digest(contract.components[kind][name]), expected, `${kind}/${name}`);
        }
    });

    it('should separate administrator definitions from active operational reference reads', () => {
        for (const [path, model, id, permission] of definitions) {
            const list = contract.paths[path].get;
            assert.equal(list['x-permission'], permission);
            assert.equal(list.operationId, `list${model}s`);
            assert.ok(list.parameters.some((item) => item.name === 'status'));
            assert.ok(list.parameters.some((item) => resolve(item).name === 'page'));
            assert.ok(list.parameters.some((item) => resolve(item).name === 'size'));
            assert.equal(contract.paths[`${path}/{${id}}`].get['x-permission'], permission);
            const response = resolve(
                contract.paths[`${path}/{${id}}`].get.responses['200'].content['application/json']
                    .schema,
            );
            assert.ok(response.required.includes('isActive'));
        }
        assert.match(contract.paths['/locations/locations'].get.description, /Only active/);
        assert.deepEqual(contract.components.schemas.ReferenceStatus.enum, [
            'all',
            'active',
            'inactive',
        ]);
    });

    it('should require If-Match and return ETags for every administrative replacement', () => {
        const paths = [
            ...definitions.map(([path, , id]) => `${path}/{${id}}`),
            '/locations/code-format',
        ];
        for (const path of paths) {
            const put = contract.paths[path].put;
            const header = put.parameters.map(resolve).find((item) => item.name === 'If-Match');
            assert.equal(header.required, true, path);
            assert.ok(put.responses['412']);
            assert.ok(put.responses['428']);
            assert.ok(put.responses['200'].headers.ETag);
            assert.ok(contract.paths[path].get.responses['200'].headers.ETag);
        }
    });

    it('should keep codes, parents, actors, tenancy and counters out of replacement inputs', () => {
        for (const [path, , id] of definitions) {
            const put = inputFor(contract.paths[`${path}/{${id}}`].put);
            assert.equal(put.additionalProperties, false);
            for (const name of [
                'code',
                'parentId',
                'actorId',
                'tenantId',
                'organizationId',
                'headId',
                'canConfirm',
            ])
                assert.equal(Object.hasOwn(put.properties, name), false);
            const post = inputFor(contract.paths[path].post);
            assert.equal(post.additionalProperties, false);
            assert.ok(post.required.includes('code'));
            assert.ok(contract.paths[path].post.responses['201'].headers.Location);
            assert.ok(contract.paths[path].post.responses['201'].headers.ETag);
            assert.equal(Object.hasOwn(contract.paths[`${path}/{${id}}`], 'delete'), false);
        }
    });

    it('should document race-safe occupied-niche and active-child restrictions', () => {
        const location = contract.paths['/locations/location-definitions/{locationId}'].put;
        const conflict = location.responses['409'].description;
        for (const code of [
            'location-has-children',
            'location-has-material',
            'location-has-active-children',
            'parent-inactive',
        ])
            assert.ok(conflict.includes(`locations.${code}`));
        assert.match(location.description, /concurrent/);
        const input = inputFor(location);
        assert.deepEqual(input.required, ['name', 'isActive', 'isNiche']);
        assert.equal(
            Object.hasOwn(contract.components.schemas.LocationDefinition.properties, 'path'),
            false,
        );
        const list = contract.paths['/locations/location-definitions'].get;
        assert.ok(list.parameters.some((item) => item.name === 'parentId'));
        assert.ok(list.parameters.some((item) => item.name === 'rootsOnly'));
    });

    it('should allow reversible type and area deactivation without deleting material links', () => {
        for (const [path, , id] of definitions.slice(1)) {
            const operation = contract.paths[`${path}/{${id}}`].put;
            assert.match(operation.description, /No usage restriction on deactivation/);
            assert.deepEqual(inputFor(operation).required, ['name', 'isActive']);
        }
        assert.equal(
            Object.hasOwn(contract.components.schemas.AreaDefinition.properties, 'headId'),
            false,
        );
    });

    it('should initialize code configuration once and never accept a counter reset', () => {
        const path = contract.paths['/locations/code-format'];
        assert.equal(path.post.operationId, 'createGeneratedCodeFormat');
        assert.match(path.post.description, /cannot be reset or overwritten/);
        assert.ok(
            path.post.responses['409'].description.includes('locations.code-format-already-exists'),
        );
        assert.match(path.put.description, /preserve next_value exactly/);
        assert.deepEqual(Object.keys(inputFor(path.put).properties), ['prefix', 'digits']);
        assert.equal(inputFor(path.put).properties.prefix.maxLength, 20);
        assert.equal(inputFor(path.put).properties.digits.maximum, 12);
    });

    it('should preview candidate formatting without allocating or making the configuration ETag volatile', () => {
        const preview = contract.paths['/locations/code-format-preview'].get;
        assert.equal(preview['x-permission'], 'locations.code-format.manage');
        assert.match(preview.description, /without advancing\/reserving the counter/);
        assert.ok(preview.parameters.every((parameter) => parameter.required));
        assert.equal(Object.hasOwn(preview.responses['200'], 'headers'), false);
        assert.ok(preview.responses['409']);
        const configuration = resolve(
            contract.paths['/locations/code-format'].get.responses['200'].content[
                'application/json'
            ].schema,
        );
        assert.deepEqual(Object.keys(configuration.properties), ['prefix', 'digits']);
        assert.match(configuration.description, /not allocations/);
    });
});
