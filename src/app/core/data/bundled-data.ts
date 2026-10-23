import rates from '../../../assets/data/rates.json';
import taxYear2027 from '../../../assets/data/tax-years/2027.json';
import type { DataSource } from './data-source';

/**
 * The JSON shipped inside the app. Static imports keep loading synchronous (no HTTP, no loading
 * state, works offline). The tax-season scout (scripts/tax-season) rewrites this file when it
 * adds a tax year, so edit the data files rather than this one.
 */
export const BUNDLED_DATA: DataSource = {
  taxYears: [{ fileName: '2027.json', data: taxYear2027 }],
  rates: { fileName: 'rates.json', data: rates },
};
