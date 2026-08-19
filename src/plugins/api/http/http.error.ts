import { HttpMethod } from '@plugins/api/http/http-method.enum';

export interface HttpErrorDetails {
    status: number;
    method: HttpMethod;
    url: string;
    responseBody: unknown;
    contentType?: string | null;
    // A small, fixed set of response headers worth keeping when a request fails.
    // Motivated by CI run 32235723842, where seven failures surfaced only as a raw
    // Cloudflare interstitial body: we could not tell what status it carried, nor
    // whose edge answered, so the episode could not be classified afterwards.
    // `cf-ray` identifies the edge event, `cf-mitigated` distinguishes a real
    // challenge from an origin error page that merely happens to be HTML, and
    // `server` says whether we are even talking to Cloudflare.
    diagnosticHeaders?: Record<string, string>;
}

export class HttpError extends Error {
    readonly status: number;
    readonly method: HttpMethod;
    readonly url: string;
    readonly responseBody: unknown;
    readonly contentType?: string | null;
    readonly diagnosticHeaders?: Record<string, string>;

    constructor(message: string, details: HttpErrorDetails) {
        super(message);
        this.name = 'HttpError';
        this.status = details.status;
        this.method = details.method;
        this.url = details.url;
        this.responseBody = details.responseBody;
        this.contentType = details.contentType;
        this.diagnosticHeaders = details.diagnosticHeaders;
    }
}

// Header names captured on failure. Cheap, bounded, and never logged on success.
export const DIAGNOSTIC_RESPONSE_HEADERS = [
    'cf-ray',
    'cf-mitigated',
    'server',
    'retry-after',
] as const;
