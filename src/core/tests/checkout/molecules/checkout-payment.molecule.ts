import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';

export async function selectPaymentMethod(method: string): Promise<void> {
    const normalized = method.toLowerCase();
    const locatorKey = normalized.includes('paypal')
        ? 'paymentPaypalButton'
        : normalized.includes('cash')
            ? 'paymentCashButton'
            : 'paymentCardButton';
    await sendIntent(INTENT.CLICK, locatorKey);
}

export async function fillCardDetails(card: string, exp: string, cvv: string, holderName?: string): Promise<void> {
    if (holderName) {
        await sendIntent(INTENT.TYPE, `cardHolderNameInput||${holderName}`);
    }
    // Strip non-digit characters — the iOS numpad keyboard on card/expiry/cvv
    // inputs only accepts digits, so "4242 4242 4242 4242" and "12/28" arrive
    // truncated. Send the raw digits and let the app's mask render the format.
    await sendIntent(INTENT.TYPE, `cardNumberInput||${card.replace(/\D/g, '')}`);
    const [month = '', year = ''] = exp.split('/').map((part) => part.replace(/\D/g, ''));
    if (!month || !year) {
        throw new Error(`Card expiry must use MM/YY format; got "${exp}".`);
    }
    await sendIntent(INTENT.SELECT_OPTION, `expiryMonthInput||${month.padStart(2, '0')}`);
    await sendIntent(INTENT.SELECT_OPTION, `expiryYearInput||${year.slice(-2)}`);
    await sendIntent(INTENT.TYPE, `cvvInput||${cvv.replace(/\D/g, '')}`);
}
