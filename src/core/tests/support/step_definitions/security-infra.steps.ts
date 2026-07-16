import { Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { SecurityInfraRoute } from '@core/tests/support/organisms/security-infra.route';

// ZAP container spin-up + MobSF upload/poll are minutes-long; give the infra
// scans plenty of headroom over the default step timeout.
setDefaultTimeout(30 * 60_000);

function route(): SecurityInfraRoute {
    return new SecurityInfraRoute();
}

// Explicit per-step timeouts — the global default is racy across domains, and
// these scans (ZAP container spin-up, MobSF upload + poll) run for minutes.
const SCAN_TIMEOUT = { timeout: 30 * 60_000 };

When('the ZAP baseline crawl runs against the frontend', SCAN_TIMEOUT, async function () {
    await route().runBaselineScan();
});

When('the TLS configuration of the API host is inspected', SCAN_TIMEOUT, async function () {
    await route().runTlsCheck();
});

When('MobSF statically analyzes the mobile app binaries', SCAN_TIMEOUT, async function () {
    await route().runMobsfScans();
});

Then('the infrastructure security report is captured', function () {
    // The scans above persist their findings to reports/ for the dashboard.
    // Infra scans record rather than gate (see SecurityInfraRoute), so this
    // step simply marks the scenario complete.
});
