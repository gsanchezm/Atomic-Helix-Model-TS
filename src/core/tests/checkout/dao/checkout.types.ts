// Public HTTP contracts for the Checkout DAO.
// Kept separate from checkout.dao.ts so consumers (molecules, routes, the world)
// can import the data shapes without depending on the class (SRP), and so a
// test fixture or contract validator only pays for the types it needs (ISP).

import type { CountryCode } from '@plugins/api/http';

// Re-export so consumers of checkout types don't reach into the API plugin.
export type { CountryCode };

// -- countries / catalog --

export interface CountryInfo {
    code: CountryCode;
    currency: string;
    currency_symbol: string;
    required_fields: string[];
    optional_fields: string[];
    tax_rate: number;
    delivery_fee: number;
    tip_field: string;
    tip_mode: 'percentage';
    languages: string[];
    decimal_places?: number;
}

export interface Pizza {
    id: string;
    name: string;
    description: string;
    price: number;
    base_price: number;
    currency: string;
    currency_symbol: string;
    image: string;
    // Canonical taxonomy from /api/pizzas: 'all' | 'popular' | 'veggie' | 'meat' | 'sides'.
    // Optional because legacy/historical responses may not include it; routes
    // should fall back to (or skip) verification when undefined.
    category?: string;
}

// -- cart --

export interface CartItemRequest {
    pizza_id: string;
    size: string;
    quantity: number;
    // Only meaningful on PUT /api/cart/items/{item_id}: the backend ignores
    // this field there (the URL id is authoritative) and strips it before
    // storing. Included so a scenario can prove that behavior by sending a
    // conflicting value here.
    item_id?: string;
}

export interface CartItemResponse {
    id: string;
    signature: string;
    pizza_id: string;
    pizza: Pizza;
    quantity: number;
    config: { size: string; toppings: string[] };
    unit_price: number;
    currency: string;
    currency_symbol: string;
}

export interface CartResponse {
    username: string;
    country_code: CountryCode;
    cart_items: CartItemResponse[];
    updated_at: string;
}

// -- cart-item management (PUT/DELETE /api/cart/items/{item_id}) --
//
// These endpoints return the session's raw (unenriched) cart — the same
// shape POST /api/cart's TestSessionStateResponse returns — not the priced
// CartItemResponse GET /api/cart returns. Keep them separate types rather
// than reusing CartItemResponse, which would claim fields (unit_price,
// pizza, currency) that this wire shape doesn't have.
export interface RawCartItem {
    pizza_id: string;
    item_id: string;
    size: string;
    quantity: number;
    toppings: string[];
}

export interface SessionStateResponse {
    username: string;
    country_code: CountryCode;
    cart_items: RawCartItem[];
    updated_at: string;
}

// -- checkout submit --

export interface CheckoutRequest {
    country_code: CountryCode;
    items: CartItemRequest[];
    name: string;
    address: string;
    phone: string;
    payment_method: string;
    zip_code?: string;
    plz?: string;
    colonia?: string;
    prefectura?: string;
    district?: string;
    card_number?: string;
    card_expiry?: string;
    card_cvv?: string;
    [tipField: string]: unknown;
}

// Backend's OrderSummary — shared verbatim by POST /api/checkout,
// GET /api/orders/{order_id} and PATCH /api/orders/{order_id} (cancellation).
export interface CheckoutResponse {
    order_id: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    tax_rate?: number;
    tip_percentage?: number;
    tax: number;
    tip?: number;
    total: number;
    currency: string;
    currency_symbol: string;
    items?: Array<Record<string, unknown>>;
    timestamp?: string;
}

// -- order cancellation (PATCH /api/orders/{order_id}) --

export interface OrderStatusUpdateRequest {
    // Literal on the backend (models.OrderStatusUpdate) — cancellation is the
    // only supported transition.
    status: 'cancelled';
}

// -- DAO construction --

export interface CheckoutDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
