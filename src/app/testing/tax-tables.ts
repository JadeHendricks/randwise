import taxYear2027 from '../../assets/data/tax-years/2027.json';
import { validateTaxYearFile } from '../core/data/tax-year.validator';
import { TaxTables, toTaxTables } from '../core/engine/tax-tables';
import { makeTaxYear } from './tax-data-fixtures';

/** Engine tables built from the shipped 2027.json, through the validator like the app does. */
export function shippedTaxTables2027(): TaxTables {
  const result = validateTaxYearFile(taxYear2027, '2027.json');
  if (!result.ok) throw new Error(`2027.json is invalid: ${result.errors.join('; ')}`);
  return toTaxTables(result.value);
}

/** Engine tables from the fixture: real brackets and rebates, fake medical, UIF and retirement values. */
export function fixtureTaxTables(): TaxTables {
  return toTaxTables(makeTaxYear(2027));
}

/** Recursively freezes a value so specs can prove a function does not mutate its inputs. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
