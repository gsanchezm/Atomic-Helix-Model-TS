import * as fs from 'fs';
import * as grpc from '@grpc/grpc-js';

const TRUE = 'true';

function isEnabled(value: string | undefined): boolean {
    return (value ?? '').trim().toLowerCase() === TRUE;
}

function readPem(envName: string): Buffer | null {
    const filePath = process.env[envName]?.trim();
    if (!filePath) return null;

    try {
        return fs.readFileSync(filePath);
    } catch (error) {
        throw new Error(`[gRPC] Cannot read ${envName} at "${filePath}": ${(error as Error).message}`);
    }
}

function requirePair(
    first: Buffer | null,
    second: Buffer | null,
    firstName: string,
    secondName: string,
): void {
    if (Boolean(first) !== Boolean(second)) {
        throw new Error(`[gRPC] ${firstName} and ${secondName} must be configured together.`);
    }
}

export function tlsEnabled(): boolean {
    return isEnabled(process.env.TOM_TLS_ENABLED)
        || Boolean(process.env.TOM_TLS_CA_PATH)
        || Boolean(process.env.TOM_TLS_SERVER_CERT_PATH)
        || Boolean(process.env.TOM_TLS_SERVER_KEY_PATH)
        || Boolean(process.env.TOM_TLS_CLIENT_CERT_PATH)
        || Boolean(process.env.TOM_TLS_CLIENT_KEY_PATH);
}

export function createServerCredentials(): grpc.ServerCredentials {
    if (!tlsEnabled()) return grpc.ServerCredentials.createInsecure();

    const certificateChain = readPem('TOM_TLS_SERVER_CERT_PATH');
    const privateKey = readPem('TOM_TLS_SERVER_KEY_PATH');
    requirePair(certificateChain, privateKey, 'TOM_TLS_SERVER_CERT_PATH', 'TOM_TLS_SERVER_KEY_PATH');
    if (!certificateChain || !privateKey) {
        throw new Error(
            '[gRPC] TLS is enabled, but TOM_TLS_SERVER_CERT_PATH and TOM_TLS_SERVER_KEY_PATH are missing.',
        );
    }

    const requireClientCertificate = isEnabled(process.env.TOM_TLS_REQUIRE_CLIENT_CERT);
    const rootCertificates = readPem('TOM_TLS_CA_PATH');
    if (requireClientCertificate && !rootCertificates) {
        throw new Error('[gRPC] TOM_TLS_CA_PATH is required when TOM_TLS_REQUIRE_CLIENT_CERT=true.');
    }

    return grpc.ServerCredentials.createSsl(
        rootCertificates,
        [{ cert_chain: certificateChain, private_key: privateKey }],
        requireClientCertificate,
    );
}

export function createClientCredentials(): grpc.ChannelCredentials {
    if (!tlsEnabled()) return grpc.credentials.createInsecure();

    const rootCertificates = readPem('TOM_TLS_CA_PATH');
    const certificateChain = readPem('TOM_TLS_CLIENT_CERT_PATH');
    const privateKey = readPem('TOM_TLS_CLIENT_KEY_PATH');
    requirePair(certificateChain, privateKey, 'TOM_TLS_CLIENT_CERT_PATH', 'TOM_TLS_CLIENT_KEY_PATH');

    return grpc.credentials.createSsl(
        rootCertificates,
        privateKey,
        certificateChain,
    );
}

export function bindAddress(port: string | number): string {
    const host = process.env.TOM_BIND_ADDRESS?.trim() || '127.0.0.1';
    if (!isLoopbackHost(host) && !tlsEnabled()) {
        throw new Error(
            `[gRPC] Refusing insecure non-loopback bind on "${host}". ` +
            'Configure TLS certificates or use TOM_BIND_ADDRESS=127.0.0.1.',
        );
    }
    return `${host}:${port}`;
}

function isLoopbackHost(host: string): boolean {
    const normalized = host.toLowerCase();
    return normalized === 'localhost'
        || normalized === '::1'
        || normalized === '[::1]'
        || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function assertActionAllowed(actionId: string): void {
    if (actionId.toUpperCase() === 'EVALUATE') {
        throw new Error(
            '[Security] EVALUATE has been removed. Use an allowlisted BROWSER_COMMAND.',
        );
    }
}
