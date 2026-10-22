import rates from '../../../assets/data/rates.json';
import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import type { DataSource } from './data-source';

/**
 * The JSON shipped inside the app. Static imports keep loading synchronous (no HTTP, no loading
 * state, works offline). Each new tax year needs one import above and one entry below; the
 * tax-season scout (Task 11) will automate that.
 */
export const BUNDLED_DATA: DataSource = {
  taxYears: [{ fileName: '2027.json', data: taxYear2027 }],
  rates: { fileName: 'rates.json', data: rates },
};
