import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const log = logger.child({ layer: 'molecule', domain: 'profile', action: 'edit' });

export interface ProfileUpdateInputs {
    fullName: string;
    phone: string;
    address: string;
    notes: string;
    // ISO date "YYYY-MM-DD".
    birthday: string;
}

// CLEAR_TEXT before TYPE is required because:
//   - Web React inputs render the persisted value on mount, so a bare TYPE
//     concatenates instead of replacing.
//   - Mobile RN TextInputs have the same behavior (controlled value).
// We accept the extra round-trip per field because each scenario in the
// matrix runs only once.
export async function fillProfileForm(values: ProfileUpdateInputs): Promise<void> {
    if (isApiDriver()) {
        log.info(values, 'fillProfileForm skipped (api driver) — values held in route state');
        return;
    }
    log.info(values, 'Filling profile form');

    await typeField('profileFullNameInput', values.fullName);
    await typeField('profilePhoneNumberInput', values.phone);
    // `addressInput` is web-only in profile.locators.json — skip under mobile
    // drivers so the locator-resolver doesn't throw on a missing mobile key.
    if (!isMobileDriver()) {
        await typeField('addressInput', values.address);
    } else {
        log.info({ field: 'addressInput' }, 'Skipping address — locator is web-only and DRIVER is mobile');
    }
    await typeField('notesInput', values.notes);
    await fillBirthday(values.birthday);
}

// Web: a single native `<input type="date">` accepts a plain ISO string.
// Mobile: OmniPizza's Dropdown component (Dropdown.tsx) — 3 separate
// day/month/year selects, whose options carry zero-padded "01".."31" /
// "01".."12" values (year is plain "1950".."2015", NOT zero-padded — see
// BIRTHDAY_YEAR_OPTIONS in ProfileScreen.tsx). Mobile's option range only
// covers 1950-2015, so any ISO date used in a scenario must fall in that
// window or the dropdown option won't exist.
async function fillBirthday(isoDate: string): Promise<void> {
    if (isoDate.length === 0) return;
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) {
        throw new Error(`fillBirthday expected an ISO "YYYY-MM-DD" date, got "${isoDate}".`);
    }
    if (isMobileDriver()) {
        await sendIntent(INTENT.SCROLL_TO, 'birthdayDayInput');
        await sendIntent(INTENT.SELECT_OPTION, `birthdayDayInput||${day}`);
        await sendIntent(INTENT.SELECT_OPTION, `birthdayMonthInput||${month}`);
        await sendIntent(INTENT.SELECT_OPTION, `birthdayYearInput||${year}`);
        return;
    }
    await typeField('birthdayInput', isoDate);
}

async function typeField(key: string, value: string): Promise<void> {
    // The proxy rejects empty TYPE payloads universally — clear first, then
    // type only when the caller passes a non-empty value. All current
    // feature rows pass non-empty values, but the guard keeps the molecule
    // safe against future negative-path scenarios.
    await sendIntent(INTENT.CLEAR_TEXT, key);
    if (value.length > 0) {
        await sendIntent(INTENT.TYPE, `${key}||${value}`);
    }
}

function isApiDriver(): boolean {
    return (process.env.DRIVER ?? 'playwright').toLowerCase() === 'api';
}

function isMobileDriver(): boolean {
    const driver = (process.env.DRIVER ?? 'playwright').toLowerCase();
    return driver === 'appium' || driver === 'mobilewright';
}
