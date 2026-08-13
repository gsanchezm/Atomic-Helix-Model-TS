import { HttpClient } from '@plugins/api/http';
import type {
    CartItemRequest,
    CartResponse,
    CheckoutDaoOptions,
    CheckoutRequest,
    CheckoutResponse,
    CountryCode,
    CountryInfo,
    OrderStatusUpdateRequest,
    Pizza,
    SessionStateResponse,
} from '@core/tests/checkout/dao/checkout.types';

// Internal shape — backend wraps Pizza[] in an envelope. Not exported because
// callers receive an unwrapped Pizza[] (ISP: don't expose what consumers don't use).
interface PizzaEnvelope {
    pizzas: Pizza[];
    country_code: CountryCode;
    currency: string;
}

// Overrides HttpClient's default. Must stay ≥45s — Render free tier cold starts
// take 30–45s when the instance has been idle.
const DEFAULT_TIMEOUT_MS = 60_000;

const PATHS = {
    countries: '/api/countries',
    pizzas: '/api/pizzas',
    cart: '/api/cart',
    cartItem: '/api/cart/items',
    checkout: '/api/checkout',
    orders: '/api/orders',
} as const;

export class CheckoutDao {
    private readonly httpClient: HttpClient;

    constructor(options: CheckoutDaoOptions = {}) {
        const apiBaseUrl = options.baseUrl ?? process.env.API_BASE_URL?.replace(/\/+$/, '');
        if (!apiBaseUrl) {
            throw new Error('Missing required env var: API_BASE_URL');
        }

        this.httpClient = new HttpClient({
            baseUrl: apiBaseUrl,
            timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            fetchImpl: options.fetchImpl,
        });
    }

    getCountries(): Promise<CountryInfo[]> {
        return this.httpClient.get<CountryInfo[]>(PATHS.countries);
    }

    async getPizzas(params: {
        token: string;
        countryCode: CountryCode;
        language?: string;
    }): Promise<Pizza[]> {
        const response = await this.httpClient.get<PizzaEnvelope>(PATHS.pizzas, {
            headers: this.authHeaders(params.token, params.countryCode, {
                'X-Language': params.language ?? process.env.LANGUAGE ?? 'en',
            }),
        });
        return response.pizzas;
    }

    addToCart(params: {
        token: string;
        countryCode: CountryCode;
        items: CartItemRequest[];
    }): Promise<CartResponse> {
        return this.httpClient.post<CartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: { items: params.items },
        });
    }

    getCart(params: {
        token: string;
        countryCode: CountryCode;
    }): Promise<CartResponse> {
        return this.httpClient.get<CartResponse>(PATHS.cart, {
            headers: this.authHeaders(params.token, params.countryCode),
        });
    }

    placeOrder(params: {
        token: string;
        countryCode: CountryCode;
        body: CheckoutRequest;
    }): Promise<CheckoutResponse> {
        return this.httpClient.post<CheckoutResponse>(PATHS.checkout, {
            headers: this.authHeaders(params.token, params.countryCode),
            body: params.body,
        });
    }

    // Upsert semantics: creates item_id if absent from the caller's session,
    // fully replaces it otherwise. Any item_id on the body is ignored by the
    // backend — the URL is authoritative. Does not read X-Country-Code.
    updateCartItem(params: {
        token: string;
        itemId: string;
        item: CartItemRequest;
    }): Promise<SessionStateResponse> {
        return this.httpClient.put<SessionStateResponse>(`${PATHS.cartItem}/${params.itemId}`, {
            headers: this.bearerHeader(params.token),
            body: params.item,
        });
    }

    // 404s (via HttpError) when item_id isn't in the caller's session.
    removeCartItem(params: {
        token: string;
        itemId: string;
    }): Promise<SessionStateResponse> {
        return this.httpClient.delete<SessionStateResponse>(`${PATHS.cartItem}/${params.itemId}`, {
            headers: this.bearerHeader(params.token),
        });
    }

    getOrder(params: {
        token: string;
        orderId: string;
    }): Promise<CheckoutResponse> {
        return this.httpClient.get<CheckoutResponse>(`${PATHS.orders}/${params.orderId}`, {
            headers: this.bearerHeader(params.token),
        });
    }

    // Single supported transition: pending -> cancelled. 409 on any other
    // current status, 403 for another user's order (except
    // security_glitch_user's deliberate IDOR bypass), 404 for an unknown id.
    cancelOrder(params: {
        token: string;
        orderId: string;
    }): Promise<CheckoutResponse> {
        const body: OrderStatusUpdateRequest = { status: 'cancelled' };
        return this.httpClient.patch<CheckoutResponse>(`${PATHS.orders}/${params.orderId}`, {
            headers: this.bearerHeader(params.token),
            body,
        });
    }

    private bearerHeader(token: string): Record<string, string> {
        return { Authorization: `Bearer ${token}` };
    }

    private authHeaders(
        token: string,
        countryCode: CountryCode,
        extra: Record<string, string> = {},
    ): Record<string, string> {
        return {
            Authorization: `Bearer ${token}`,
            'x-country-code': countryCode,
            ...extra,
        };
    }
}
