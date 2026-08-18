import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePipelineConfig } from './pipeline.config.validate';

test('accepts a minimal valid config', () => {
    const config = {
        jobs: [{
            profile: 'api',
            requiredSecrets: ['API_BASE_URL'],
            requiredVars: [],
            artifacts: ['artifacts/api/**'],
            matrix: { suite: ['reads', 'writes'] },
        }],
    };
    assert.doesNotThrow(() => validatePipelineConfig(config));
});

test('rejects a job missing "profile"', () => {
    const config = { jobs: [{ requiredSecrets: [], requiredVars: [], artifacts: [], matrix: {} }] };
    assert.throws(() => validatePipelineConfig(config), /jobs\[0\]\.profile/);
});

test('rejects a duplicate profile name', () => {
    const job = { profile: 'api', requiredSecrets: [], requiredVars: [], artifacts: [], matrix: {} };
    assert.throws(() => validatePipelineConfig({ jobs: [job, job] }), /duplicate profile "api"/);
});

test('rejects a non-array "matrix" dimension value', () => {
    const config = {
        jobs: [{ profile: 'api', requiredSecrets: [], requiredVars: [], artifacts: [], matrix: { suite: 'reads' } }],
    };
    assert.throws(() => validatePipelineConfig(config), /matrix\.suite must be an array/);
});
