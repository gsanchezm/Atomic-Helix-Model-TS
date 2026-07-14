type ExecuteFn = (actionId: string, targetSelector: string, sessionId: string) => Promise<string>;

const LOADERS: Readonly<Record<string, () => Promise<{ execute: ExecuteFn }>>> = {
    playwright: () => import('@plugins/playwright/playwright'),
    appium: () => import('@plugins/appium/appium'),
    gatling: () => import('@plugins/gatling/gatling'),
    api: () => import('@plugins/api/api'),
    pixelmatch: () => import('@plugins/pixelmatch/pixelmatch'),
    mobilewright: () => import('@plugins/mobilewright/mobilewright'),
};

const configuredPlugins = new Set(
    (process.env.TOM_IN_PROCESS_PLUGINS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
);

const executors = new Map<string, Promise<ExecuteFn>>();
const activeSessions = new Set<string>();
const statefulPlugins = new Set(['playwright', 'appium', 'mobilewright']);

export function validateInProcessPlugins(): void {
    const unknown = [...configuredPlugins].filter((name) => !LOADERS[name]);
    if (unknown.length > 0) {
        throw new Error(
            `[Proxy] Unknown TOM_IN_PROCESS_PLUGINS value(s): ${unknown.join(', ')}. ` +
            `Supported plugins: ${Object.keys(LOADERS).join(', ')}.`,
        );
    }
}

export function inProcessPluginNames(): string[] {
    return [...configuredPlugins];
}

export function isInProcessPlugin(platform: string): boolean {
    return configuredPlugins.has(platform.split(':')[0].toLowerCase());
}

async function getExecutor(plugin: string): Promise<ExecuteFn> {
    let executor = executors.get(plugin);
    if (!executor) {
        executor = LOADERS[plugin]().then((module) => module.execute);
        executors.set(plugin, executor);
    }
    return executor;
}

export async function routeInProcess(
    platform: string,
    actionId: string,
    targetSelector: string,
): Promise<string> {
    const [plugin, sessionId = '0'] = platform.toLowerCase().split(':');
    const execute = await getExecutor(plugin);
    const sessionKey = `${plugin}:${sessionId}`;

    if (statefulPlugins.has(plugin)) {
        if (actionId.toUpperCase() === 'TEARDOWN') {
            activeSessions.delete(sessionKey);
        } else {
            activeSessions.add(sessionKey);
        }
    }

    return execute(actionId, targetSelector, sessionId);
}

export async function shutdownInProcessPlugins(): Promise<void> {
    const sessions = [...activeSessions];
    activeSessions.clear();

    await Promise.all(sessions.map(async (sessionKey) => {
        const separator = sessionKey.indexOf(':');
        const plugin = sessionKey.slice(0, separator);
        const sessionId = sessionKey.slice(separator + 1);
        const execute = await getExecutor(plugin);
        await execute('TEARDOWN', '', sessionId);
    }));
}
