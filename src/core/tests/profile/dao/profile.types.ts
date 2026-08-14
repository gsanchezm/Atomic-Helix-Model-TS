// Public HTTP contract for the Profile DAO.
//
// Shapes mirror `profile.api.contract.json` and the live backend
// (backend/models.py's UserProfileDetails/UserProfileUpdate). Kept separate
// from profile.dao.ts so consumers (route, molecules, fixtures) can import
// the shape without pulling the DAO class (SRP).

import type { CountryCode } from '@plugins/api/http';

// Re-export so callers don't reach into the API plugin for the country type.
export type { CountryCode };

// -- single profile -------------------------------------------------------

export interface ProfileResponse {
    full_name: string;
    phone: string;
    address: string;
    notes: string;
    // ISO date "YYYY-MM-DD" (backend/models.py's UserProfileDetails.birthday).
    birthday: string;
    premium: boolean;
    // Optional fields the backend may echo back; not load-bearing for the
    // current scenarios but useful when validating multi-user fixtures.
    username?: string;
    country_code?: CountryCode;
    // Allow extra keys without weakening the declared ones.
    [key: string]: unknown;
}

// -- update request -------------------------------------------------------
//
// PATCH semantics: any subset of these fields may be sent; the backend MUST
// merge with the existing record rather than replacing it (matches FastAPI
// conventions and the contract.json note).

export interface ProfileUpdateRequest {
    full_name?: string;
    phone?: string;
    address?: string;
    notes?: string;
    // ISO date "YYYY-MM-DD" (backend/models.py's UserProfileUpdate.birthday).
    birthday?: string;
    [key: string]: unknown;
}

// -- DAO construction -----------------------------------------------------

export interface ProfileDaoOptions {
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
