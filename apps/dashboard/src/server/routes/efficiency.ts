import { Router } from 'express';

import type { EfficiencyRunPoint } from '../../shared/types.js';
import { getTiming, listRuns } from '../runs-repo.js';

const MAX_RUNS = 20;

export const efficiencyRouter = Router();

efficiencyRouter.get('/api/efficiency', async (_req, res, next) => {
  try {
    const runs = (await listRuns()).slice(0, MAX_RUNS);
    const points: EfficiencyRunPoint[] = [];
    for (const run of runs) {
      const timings = await getTiming(run.runId);
      if (timings.length === 0) continue;
      points.push({ runId: run.runId, startedAt: run.startedAt, timings });
    }
    res.json(points);
  } catch (err) {
    next(err);
  }
});
