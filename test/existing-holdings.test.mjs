import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, describe, it } from 'node:test';
import YAML from 'yaml';

let contract;
before(async () => {
    contract = YAML.parse(await readFile(new URL('../dist/openapi.yaml', import.meta.url), 'utf8'));
});
const resolve = (value) => {
    if (!value.$ref) return value;
    return value.$ref
        .split('/')
        .slice(1)
        .reduce((node, key) => node[key], contract);
};

describe('Existing holdings agreement', () => {
    it('should require a stable retry key even when the server generates the code', () => {
        const operation = contract.paths['/custody/existing-holdings'].post;
        const header = operation.parameters
            .map(resolve)
            .find((item) => item.name === 'Idempotency-Key');
        assert.equal(header.required, true);
        assert.equal(header.schema.format, 'uuid');
        const input = resolve(operation.requestBody.content['application/json'].schema);
        assert.equal(input.required.includes('code'), false);
        assert.match(operation.description, /Concurrent same-key requests replay one success/);
    });

    it('should keep tenant identity, actor, time and catalog creation outside the input', () => {
        const operation = contract.paths['/custody/existing-holdings'].post;
        const input = resolve(operation.requestBody.content['application/json'].schema);
        assert.equal(input.additionalProperties, false);
        for (const key of [
            'tenantId',
            'organizationId',
            'observedAt',
            'observedBy',
            'workId',
            'accessionId',
        ]) {
            assert.equal(Object.hasOwn(input.properties, key), false);
        }
        assert.equal(operation['x-permission'], 'custody.holdings.register');
        assert.match(operation.description, /without an area-head check/);
        const areaPage = resolve(
            contract.paths['/platform/areas'].get.responses['200'].content['application/json']
                .schema,
        );
        const area = resolve(areaPage.properties.items.items);
        assert.equal(Object.hasOwn(area.properties, 'canConfirm'), false);
    });

    it('should distinguish a taken container code from reuse of a retry key with different input', () => {
        const response = contract.paths['/custody/existing-holdings'].post.responses['409'];
        const alternatives = response.content['application/problem+json'].schema.oneOf.map(resolve);
        const taken = alternatives.find((item) =>
            item.properties.code.enum.includes('locations.container-code-taken'),
        );
        const reused = alternatives.find((item) =>
            item.properties.code.enum.includes('request.idempotency-key-reused'),
        );
        assert.ok(taken.required.includes('existingContainerId'));
        assert.equal(Object.hasOwn(reused.properties, 'existingContainerId'), false);
    });

    it('should use query-based scan lookup and preserve custody entitlement on history reads', () => {
        const lookup = contract.paths['/locations/containers/lookup'].get;
        assert.ok(
            lookup.parameters.some(
                (parameter) =>
                    parameter.in === 'query' && parameter.name === 'code' && parameter.required,
            ),
        );
        const history = contract.paths['/custody/containers/{containerId}/history'].get;
        assert.deepEqual(history['x-required-entitlements'], ['custody', 'locations']);
        assert.equal(history['x-permission'], 'locations.containers.read');
    });
});
