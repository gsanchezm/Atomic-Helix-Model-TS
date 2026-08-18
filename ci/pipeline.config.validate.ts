export interface PipelineJobConfig {
    profile: string;
    requiredSecrets: string[];
    requiredVars: string[];
    artifacts: string[];
    matrix: Record<string, string[]>;
}
export interface PipelineConfig {
    jobs: PipelineJobConfig[];
}

export function validatePipelineConfig(config: unknown): PipelineConfig {
    if (config === null || typeof config !== 'object' || !Array.isArray((config as any).jobs)) {
        throw new Error('pipeline.config.json: expected a top-level {"jobs": [...]} object.');
    }
    const jobs = (config as any).jobs as unknown[];
    const seen = new Set<string>();
    jobs.forEach((job, i) => {
        if (job === null || typeof job !== 'object') {
            throw new Error(`jobs[${i}]: expected an object.`);
        }
        const j = job as any;
        if (typeof j.profile !== 'string' || j.profile.length === 0) {
            throw new Error(`jobs[${i}].profile: expected a non-empty string.`);
        }
        if (seen.has(j.profile)) {
            throw new Error(`jobs: duplicate profile "${j.profile}" at index ${i}.`);
        }
        seen.add(j.profile);
        for (const field of ['requiredSecrets', 'requiredVars', 'artifacts']) {
            if (!Array.isArray(j[field])) {
                throw new Error(`jobs[${i}].${field}: expected an array of strings.`);
            }
        }
        if (j.matrix === null || typeof j.matrix !== 'object' || Array.isArray(j.matrix)) {
            throw new Error(`jobs[${i}].matrix: expected an object.`);
        }
        for (const dim of Object.keys(j.matrix)) {
            if (!Array.isArray(j.matrix[dim])) {
                throw new Error(`jobs[${i}].matrix.${dim} must be an array.`);
            }
        }
    });
    return config as PipelineConfig;
}
