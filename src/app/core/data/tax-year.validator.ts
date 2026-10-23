import { isIsoDate, taxYearPeriod } from './tax-calendar';
import {
  BracketRow,
  Rebates,
  TAX_YEAR_FIELD_KEYS,
  TAX_YEAR_STATUSES,
  TaxYearData,
  TaxYearFieldKey,
} from './tax-year.schema';
import { ValidationResult, formatRand, isHttpsUrl, isRecord } from './validation';

/** Bases and thresholds are published rounded to whole rands, so allow R1 either way. */
const RAND_TOLERANCE = 1;
const SHARE_TOLERANCE = 1e-9;
// Absorbs floating-point noise so "off by exactly R1" passes reliably.
const EPSILON = 1e-6;

type NumberKind = 'money' | 'rate' | 'count';

const FILE_NAME = /^(\d{4})\.json$/;

/**
 * Validates one tax-year file and reports every problem it finds, not just the first,
 * so whoever edits the file can fix it in one pass.
 */
export function validateTaxYearFile(
  data: unknown,
  fileName: string,
): ValidationResult<TaxYearData> {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${fileName}: ${message}`);

  if (!isRecord(data)) {
    fail('is not a JSON object.');
    return { ok: false, errors };
  }

  const taxYear = data['taxYear'];
  const taxYearValid = Number.isInteger(taxYear) && (taxYear as number) > 0;
  if (!taxYearValid) fail('taxYear must be a positive whole number such as 2027.');

  const nameMatch = FILE_NAME.exec(fileName.split(/[\\/]/).pop() ?? '');
  if (!nameMatch) {
    fail('file name must be the tax year followed by .json, for example 2027.json.');
  } else if (taxYearValid && Number(nameMatch[1]) !== taxYear) {
    fail(`taxYear is ${taxYear} but the file name says ${nameMatch[1]}.`);
  }

  const status = data['status'];
  if (!TAX_YEAR_STATUSES.includes(status as never)) {
    fail(
      `status must be one of ${TAX_YEAR_STATUSES.join(', ')} (found ${JSON.stringify(status)}).`,
    );
  }

  if (!isIsoDate(data['verifiedOn'])) {
    fail(
      `verifiedOn must be a real date as YYYY-MM-DD (found ${JSON.stringify(data['verifiedOn'])}).`,
    );
  }

  checkPeriod(data['period'], taxYearValid ? (taxYear as number) : null, fail);

  const sources = data['sources'];
  const sourceList: string[] = [];
  if (!Array.isArray(sources) || sources.length === 0) {
    fail('sources must be a non-empty list of https URLs.');
  } else {
    sources.forEach((source, i) => {
      if (isHttpsUrl(source)) sourceList.push(source);
      else fail(`sources[${i}] must be an https URL (found ${JSON.stringify(source)}).`);
    });
  }

  const values: Partial<Record<TaxYearFieldKey, unknown>> = {};
  for (const key of TAX_YEAR_FIELD_KEYS) {
    const field = data[key];
    if (!isRecord(field)) {
      fail(`${key} is missing or is not an object with value, carriedForward and source.`);
      continue;
    }
    if (!('value' in field)) fail(`${key}.value is missing.`);
    if (typeof field['carriedForward'] !== 'boolean') {
      fail(`${key}.carriedForward must be true or false.`);
    }
    const source = field['source'];
    if (!isHttpsUrl(source)) {
      fail(`${key}.source must be an https URL.`);
    } else if (!sourceList.includes(source)) {
      fail(`${key}.source ${source} is not listed in sources.`);
    }
    if ('value' in field) values[key] = field['value'];
  }

  // A file with unconfirmed (carried-forward) values must not claim to be verified.
  const carried = TAX_YEAR_FIELD_KEYS.filter((key) => {
    const field = data[key];
    return isRecord(field) && field['carriedForward'] === true;
  });
  if ((status === 'verified' || status === 'verified-auto') && carried.length > 0) {
    fail(
      `status is "${status}" but ${carried.join(', ')} ${carried.length === 1 ? 'is' : 'are'} ` +
        `carried forward, so status must be "draft" ` +
        `(a verified or verified-auto file cannot have carried-forward fields).`,
    );
  }

  const check = new FieldChecker(fail, values);

  const incomeTax = check.brackets('incomeTaxBrackets');
  const rebates = check.numbers('rebates', {
    primary: 'money',
    secondary: 'money',
    tertiary: 'money',
  });
  const thresholds = check.numbers('thresholds', {
    under65: 'money',
    age65to74: 'money',
    age75plus: 'money',
  });
  check.numbers('medicalCredits', {
    mainMember: 'money',
    firstDependant: 'money',
    additionalDependant: 'money',
  });
  check.numbers('uif', { employeeRate: 'rate', monthlyEarningsCeiling: 'money' });
  check.numbers('retirementDeduction', {
    rate: 'rate',
    annualCap: 'money',
  });
  check.numbers('tfsa', {
    annualLimit: 'money',
    lifetimeLimit: 'money',
    excessPenaltyRate: 'rate',
  });
  check.brackets('retirementLumpSum');
  check.brackets('withdrawalLumpSum');
  const twoPot = check.numbers('twoPot', {
    savingsShare: 'rate',
    retirementShare: 'rate',
    minimumWithdrawal: 'money',
    withdrawalsPerTaxYear: 'count',
  });
  check.single('annuitisationDeMinimis', 'money');
  const drawdown = check.numbers('livingAnnuityDrawdown', {
    minRate: 'rate',
    maxRate: 'rate',
  });
  check.numbers('interestExemption', {
    under65: 'money',
    age65plus: 'money',
  });
  check.numbers('cgt', { annualExclusion: 'money', inclusionRate: 'rate' });
  check.single('dividendsWithholdingRate', 'rate');
  check.single('earliestRaRetirementAge', 'count');

  if (incomeTax && rebates && thresholds) {
    checkThresholds(incomeTax, rebates, thresholds, fail);
  }

  if (twoPot) {
    const sum = twoPot['savingsShare'] + twoPot['retirementShare'];
    if (Math.abs(sum - 1) > SHARE_TOLERANCE) {
      fail(`twoPot savingsShare and retirementShare must add up to 1 (they add up to ${sum}).`);
    }
  }

  if (drawdown && !(drawdown['minRate'] < drawdown['maxRate'])) {
    fail('livingAnnuityDrawdown minRate must be lower than maxRate.');
  }

  return errors.length === 0
    ? { ok: true, value: data as unknown as TaxYearData }
    : { ok: false, errors };
}

function checkPeriod(period: unknown, taxYear: number | null, fail: (m: string) => void): void {
  if (!isRecord(period)) {
    fail('period must be an object with start and end dates.');
    return;
  }
  const start = period['start'];
  const end = period['end'];
  const startOk = isIsoDate(start);
  const endOk = isIsoDate(end);
  if (!startOk)
    fail(`period.start must be a real date as YYYY-MM-DD (found ${JSON.stringify(start)}).`);
  if (!endOk) fail(`period.end must be a real date as YYYY-MM-DD (found ${JSON.stringify(end)}).`);
  if (taxYear === null || !startOk || !endOk) return;

  const expected = taxYearPeriod(taxYear);
  if (start !== expected.start || end !== expected.end) {
    fail(
      `period must run from ${expected.start} to ${expected.end} for tax year ${taxYear} ` +
        `(found ${start} to ${end}).`,
    );
  }
}

/*
 * Tax thresholds are the income at which the rebates cancel the lowest-bracket tax:
 * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 */
function checkThresholds(
  brackets: readonly BracketRow[],
  rebates: Rebates,
  thresholds: Record<string, number>,
  fail: (m: string) => void,
): void {
  const lowestRate = brackets[0].rate;
  if (lowestRate <= 0) return;
  const expected: Record<string, number> = {
    under65: rebates.primary / lowestRate,
    age65to74: (rebates.primary + rebates.secondary) / lowestRate,
    age75plus: (rebates.primary + rebates.secondary + rebates.tertiary) / lowestRate,
  };
  for (const key of ['under65', 'age65to74', 'age75plus']) {
    const actual = thresholds[key];
    if (Math.abs(actual - expected[key]) > RAND_TOLERANCE + EPSILON) {
      fail(
        `thresholds.${key} is ${formatRand(actual)} but the rebates divided by the lowest rate ` +
          `give ${formatRand(Math.round(expected[key]))} (allowed difference R${RAND_TOLERANCE}).`,
      );
    }
  }
}

/** Type and range checks for field values; each returns the value when it is usable for cross-checks. */
class FieldChecker {
  constructor(
    private readonly fail: (message: string) => void,
    // Only fields that were present; a missing field has already been reported once.
    private readonly values: Partial<Record<TaxYearFieldKey, unknown>>,
  ) {}

  single(key: TaxYearFieldKey, kind: NumberKind): number | null {
    return key in this.values ? this.number(key, this.values[key], kind) : null;
  }

  number(path: string, value: unknown, kind: NumberKind): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(`${path} must be a number.`);
      return null;
    }
    if (value < 0) {
      this.fail(`${path} must not be negative (found ${value}).`);
      return null;
    }
    if (kind === 'rate' && value > 1) {
      this.fail(`${path} is a rate and must be between 0 and 1 (found ${value}).`);
      return null;
    }
    if (kind === 'count' && (!Number.isInteger(value) || value === 0)) {
      this.fail(`${path} must be a positive whole number (found ${value}).`);
      return null;
    }
    return value;
  }

  numbers<K extends string>(
    key: TaxYearFieldKey,
    spec: Record<K, NumberKind>,
  ): Record<K, number> | null {
    if (!(key in this.values)) return null;
    const value = this.values[key];
    if (!isRecord(value)) {
      this.fail(`${key}.value must be an object.`);
      return null;
    }
    let ok = true;
    const result = {} as Record<K, number>;
    for (const name of Object.keys(spec) as K[]) {
      const n = this.number(`${key}.${name}`, value[name], spec[name]);
      if (n === null) ok = false;
      else result[name] = n;
    }
    return ok ? result : null;
  }

  /*
   * Each bracket's base is the tax on all income below it, so it must equal the
   * running total of the lower rows (SARS rounds these to whole rands):
   * https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
   */
  brackets(key: TaxYearFieldKey): readonly BracketRow[] | null {
    if (!(key in this.values)) return null;
    const value = this.values[key];
    if (!Array.isArray(value) || value.length === 0) {
      this.fail(`${key}.value must be a non-empty list of bracket rows.`);
      return null;
    }

    const rows: BracketRow[] = [];
    value.forEach((raw, i) => {
      const row = `${key} row ${i + 1}`;
      if (!isRecord(raw)) {
        this.fail(`${row} must be an object with above, upTo, base and rate.`);
        return;
      }
      const above = this.number(`${row} above`, raw['above'], 'money');
      const base = this.number(`${row} base`, raw['base'], 'money');
      const rate = this.number(`${row} rate`, raw['rate'], 'rate');
      const upToRaw = raw['upTo'];
      const upTo = upToRaw === null ? null : this.number(`${row} upTo`, upToRaw, 'money');
      if (upToRaw !== null && upTo === null) return;
      if (above !== null && base !== null && rate !== null) rows.push({ above, upTo, base, rate });
    });
    if (rows.length !== value.length) return null;

    let ok = true;
    const problem = (message: string) => {
      ok = false;
      this.fail(message);
    };

    if (rows[0].above !== 0)
      problem(`${key} row 1 must start at above 0 (found ${rows[0].above}).`);
    if (rows[0].base !== 0) problem(`${key} row 1 base must be 0 (found ${rows[0].base}).`);

    let cumulative = 0;
    rows.forEach((row, i) => {
      const label = `${key} row ${i + 1}`;
      const isLast = i === rows.length - 1;
      if (row.upTo === null && !isLast)
        problem(`${label} has no upper limit but is not the last row.`);
      if (row.upTo !== null && isLast) problem(`${label} is the last row and must have upTo null.`);
      if (row.upTo !== null && !(row.upTo > row.above)) {
        problem(`${label} upTo (${row.upTo}) must be greater than above (${row.above}).`);
      }

      if (i > 0) {
        const prev = rows[i - 1];
        if (prev.upTo !== null && row.above !== prev.upTo) {
          const kind = row.above > prev.upTo ? 'a gap' : 'an overlap';
          problem(
            `${label} starts above ${row.above} but row ${i} ends at ${prev.upTo}, leaving ${kind}.`,
          );
        }
        if (!(row.rate > prev.rate)) {
          problem(`${label} rate ${row.rate} must be higher than row ${i} rate ${prev.rate}.`);
        }
        if (prev.upTo !== null) cumulative += prev.rate * (prev.upTo - prev.above);
        if (Math.abs(row.base - cumulative) > RAND_TOLERANCE + EPSILON) {
          problem(
            `${label} base is ${formatRand(row.base)} but the lower rows add up to ` +
              `${formatRand(Math.round(cumulative))} (allowed difference R${RAND_TOLERANCE}).`,
          );
        }
      }
    });

    return ok ? rows : null;
  }
}
