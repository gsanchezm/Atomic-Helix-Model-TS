import { hasLocatorKey, resolveLocator } from '@kernel/locator-resolver';
import { VisualSnapshot } from '@core/contracts/visual-contract.types';

export interface ResolvedVisualTarget {
  snapshotId: string;
  resolvedRegion: string | null;
  resolvedRegionStrategy: 'web' | 'android' | 'ios' | 'fallback' | 'unresolved';
  resolvedMasks: string[];
  unresolvedRefs: string[];
}

function detectStrategy(): ResolvedVisualTarget['resolvedRegionStrategy'] {
  const platform = (process.env.PLATFORM || 'web').toLowerCase();
  if (platform === 'web' || platform === 'android' || platform === 'ios') return platform;
  return 'fallback';
}

// Visual snapshots are platform-scoped, not tool-scoped (a mask/region ref
// resolves the same way regardless of which action-execution driver is
// running). Route through the webdriver family, whose branches are always
// bare strings — the same raw CSS/accessibility-id shape this resolver
// already expected before tool-keyed locators existed. Untouched domains
// have no `webdriverio`/`appium` branch at all, so this falls straight
// through to the legacy web/mobile.* shape, unchanged.
function familyDriverForPlatform(): string {
  const platform = (process.env.PLATFORM || 'web').toLowerCase();
  return platform === 'android' || platform === 'ios' ? 'appium' : 'webdriverio';
}

export function resolveVisualTarget(snapshot: VisualSnapshot, opts?: { strict?: boolean }): ResolvedVisualTarget {
  const strict = opts?.strict !== false;
  const unresolved: string[] = [];
  const out: ResolvedVisualTarget = {
    snapshotId: snapshot.id,
    resolvedRegion: null,
    resolvedRegionStrategy: 'unresolved',
    resolvedMasks: [],
    unresolvedRefs: unresolved,
  };

  const driver = familyDriverForPlatform();

  if (!hasLocatorKey(snapshot.regionRef)) {
    unresolved.push(snapshot.regionRef);
  } else {
    try {
      out.resolvedRegion = resolveLocator(snapshot.regionRef, driver);
      out.resolvedRegionStrategy = detectStrategy();
    } catch (e) {
      unresolved.push(snapshot.regionRef);
    }
  }

  for (const ref of snapshot.maskRefs ?? []) {
    if (!hasLocatorKey(ref)) {
      unresolved.push(ref);
      continue;
    }
    try {
      out.resolvedMasks.push(resolveLocator(ref, driver));
    } catch {
      unresolved.push(ref);
    }
  }

  if (strict && unresolved.length > 0) {
    throw new Error(
      `[visual-target-resolver] snapshot '${snapshot.id}' has unresolved refs: ${unresolved.join(', ')}`,
    );
  }
  return out;
}
