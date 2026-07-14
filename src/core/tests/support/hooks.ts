import { AfterStep, AfterAll, BeforeAll } from '@cucumber/cucumber';
import { ensureTelemetryFile, logEvent, TelemetryEvent } from '@telemetry/logger';
import { streamToMinio } from '@telemetry/minio-publisher';
import { randomUUID } from 'crypto';
import { warmUpServices } from './warm-up';

let currentRunId: string;
let telemetryFilePath: string;

BeforeAll(async function () {
  currentRunId = process.env.TOM_RUN_ID || randomUUID();
  // Wake the Render free-tier dynos so the first scenario doesn't eat the
  // cold start and blow its element-wait budget.
  await warmUpServices();
});

AfterStep(async function ({ pickle, pickleStep, result }) {
  // Translate cucumber status to AHM outcome
  const outcomes: Readonly<Record<string, 'PASS' | 'FAIL' | 'SKIPPED'>> = {
    PASSED: 'PASS',
    FAILED: 'FAIL',
  };
  const outcome = outcomes[result.status] ?? 'SKIPPED';

  const durationMs = result.duration ?
    (result.duration.seconds * 1000) + (result.duration.nanos / 1_000_000) : 0;

  const event: TelemetryEvent = {
    timestamp: new Date().toISOString(),
    runId: currentRunId,
    // Note: platform and viewport should be injected from World/config
    platform: process.env.AHM_PLATFORM || 'UNKNOWN',
    viewport: process.env.AHM_VIEWPORT || 'UNKNOWN',
    scenario: pickle.name,
    step: pickleStep.text,
    outcome: outcome,
    durationMs: Math.round(durationMs),
    errorMessage: result.message
  };

  telemetryFilePath = logEvent(event);
});

AfterAll(async function () {
  if (currentRunId) {
    telemetryFilePath = ensureTelemetryFile(currentRunId);
  }

  if (telemetryFilePath && currentRunId) {
    await streamToMinio(telemetryFilePath, currentRunId);
  }
});
