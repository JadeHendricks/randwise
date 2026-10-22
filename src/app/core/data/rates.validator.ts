import { RATE_KEYS, RatesFile } from './rates.schema';
import { isIsoDate } from './tax-calendar';
import { ValidationResult, isFiniteNonNegative, isHttpsUrl, isRecord } from './validation';

/** Validates the rates snapshot and reports every problem it finds. */
export function validateRatesFile(data: unknown, fileName: string): ValidationResult<RatesFile> {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${fileName}: ${message}`);

  if (!isRecord(data)) {
    fail('is not a JSON object.');
    return { ok: false, errors };
  }

  if (!isHttpsUrl(data['source'])) fail('source must be an https URL.');

  const fetchedOn = data['fetchedOn'];
  const fetchedOk = isIsoDate(fetchedOn);
  if (!fetchedOk) {
    fail(`fetchedOn must be a real date as YYYY-MM-DD (found ${JSON.stringify(fetchedOn)}).`);
  }

  const rates = data['rates'];
  if (!isRecord(rates)) {
    fail('rates must be an object with repo, prime, cpi, r2030, r209 and zaronia.');
    return { ok: false, errors };
  }

  for (const key of RATE_KEYS) {
    const entry = rates[key];
    if (!isRecord(entry)) {
      fail(`rates.${key} is missing.`);
      continue;
    }
    if (typeof entry['label'] !== 'string' || entry['label'].trim() === '') {
      fail(`rates.${key}.label must be a non-empty string.`);
    }
    if (typeof entry['seriesCode'] !== 'string' || entry['seriesCode'].trim() === '') {
      fail(`rates.${key}.seriesCode must be a non-empty string.`);
    }
    const value = entry['valuePercent'];
    if (!isFiniteNonNegative(value) || value > 100) {
      fail(
        `rates.${key}.valuePercent must be a number from 0 to 100 (found ${JSON.stringify(value)}).`,
      );
    }
    const asOf = entry['asOf'];
    if (!isIsoDate(asOf)) {
      fail(`rates.${key}.asOf must be a real date as YYYY-MM-DD (found ${JSON.stringify(asOf)}).`);
    } else if (fetchedOk && asOf > fetchedOn) {
      fail(`rates.${key}.asOf (${asOf}) is after fetchedOn (${fetchedOn}).`);
    }
  }

  return errors.length === 0
    ? { ok: true, value: data as unknown as RatesFile }
    : { ok: false, errors };
}
