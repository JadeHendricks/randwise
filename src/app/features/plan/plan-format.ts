import { navItem } from '../../core/navigation/nav-items';
import {
  type PlanAnswers,
  type PlanGoal,
  type PlanQuestionId,
  RISK_LEVELS,
  planQuestions,
} from '../../core/plan/plan-answers';
import type { PlanBasics, PlanCalculator, PlanFigure } from '../../core/plan/plan-builder';
import { formatPercent, formatRand, formatRandWhole } from '../../shared/format/format-rand';
import type { ChoiceOption } from '../../shared/molecules/choice-list/choice-list';

/** A figure as plain text: "R 8 250 a month", "26%", "Age 55", "38 months". */
export function formatPlanFigure(figure: PlanFigure): string {
  const { value } = figure;
  switch (figure.unit) {
    case 'rand':
      return formatRandWhole(value);
    case 'rand-month':
      return `${formatRandWhole(value)} a month`;
    case 'rand-year':
      return `${formatRandWhole(value)} a year`;
    case 'percent':
      return formatPercent(value / 100, 0);
    case 'age':
      return `Age ${Math.round(value)}`;
    case 'years': {
      const years = Math.round(value);
      return `${years} ${years === 1 ? 'year' : 'years'}`;
    }
    case 'months': {
      const months = Math.round(value);
      return `${months} ${months === 1 ? 'month' : 'months'}`;
    }
  }
}

/** The text on each step's button, from the same headings as the navigation. */
export const CALCULATOR_LABELS: Record<PlanCalculator, string> = {
  pay: `Open in ${navItem('pay').heading}`,
  ra: `Open in ${navItem('ra').heading}`,
  retire: `Open in ${navItem('retire').heading}`,
  budget: `Open in ${navItem('budget').heading}`,
  journey: `Open in ${navItem('journey').heading}`,
};

/** The heading and the lead line of each question. */
export const QUESTION_COPY: Record<PlanQuestionId, { readonly title: string; readonly lead: string }> = {
  age: {
    title: 'How old are you?',
    lead: 'Your age sets your tax rebates and how long your money has to grow.',
  },
  income: {
    title: 'What do you earn?',
    lead: 'Enter what you are paid before or after tax. We work out the other one for you.',
  },
  goal: {
    title: 'What do you want to do with your money?',
    lead: 'Pick the goal that matters most right now. You can change it later.',
  },
  'retire-details': {
    title: 'When do you want to retire?',
    lead: "Tell us the age and the monthly income you would like, in today's money.",
  },
  'tfsa-details': {
    title: 'What do you want to save in a TFSA?',
    lead: 'Pick a target and the amount you could put in each month.',
  },
  'emergency-details': {
    title: 'How long should your emergency fund last?',
    lead: 'Choose the number of months of essential spending it should cover.',
  },
  risk: {
    title: 'How comfortable are you with risk?',
    lead: 'This sets how fast we assume your savings grow. Higher growth also means bigger ups and downs.',
  },
  money: {
    title: 'How much can you invest each month?',
    lead: 'Use what is left after your essentials. Add what you have saved already if you like.',
  },
};

export const GOAL_OPTIONS: readonly ChoiceOption<PlanGoal>[] = [
  {
    value: 'retire-early',
    label: 'Retire early',
    description: 'See what to save each month to stop working at the age you choose.',
  },
  {
    value: 'pay-less-tax',
    label: 'Pay less tax',
    description: 'Use your retirement annuity tax deduction and invest the refund.',
  },
  {
    value: 'build-tfsa',
    label: 'Build tax-free savings',
    description: 'Grow a TFSA to a target without paying tax on the growth.',
  },
  {
    value: 'emergency-fund',
    label: 'Build an emergency fund',
    description: 'Set aside enough to cover your essentials if something goes wrong.',
  },
  {
    value: 'buy-home',
    label: 'Buy a home',
    description: 'Information only for now: see what housing could cost you each month.',
  },
];

export interface AnswerRow {
  readonly id: PlanQuestionId;
  readonly label: string;
  readonly value: string;
}

const ROW_LABELS: Record<PlanQuestionId, string> = {
  age: 'Age',
  income: 'Income',
  goal: 'Goal',
  'retire-details': 'Retirement plan',
  'tfsa-details': 'TFSA plan',
  'emergency-details': 'Emergency fund',
  risk: 'Risk comfort',
  money: 'Money to invest',
};

/** Whole rands when there are no cents, otherwise with cents (a take-home entry can have them). */
function randText(amount: number): string {
  return Number.isInteger(amount) ? formatRandWhole(amount) : formatRand(amount);
}

function incomeText(answers: PlanAnswers): string {
  const { basis, period, amount } = answers.income;
  return `${randText(amount)} ${basis === 'gross' ? 'gross' : 'take-home'} a ${period === 'monthly' ? 'month' : 'year'}`;
}

function moneyText(answers: PlanAnswers, basics: PlanBasics | null): string {
  if (answers.surplusMonthly !== null) return `${randText(answers.surplusMonthly)} a month`;
  return basics ? `${formatRandWhole(basics.suggestedSurplus)} a month (suggested)` : 'Our suggestion';
}

/** One row for each question asked, in order, for the "Your answers" list. */
export function answerRows(answers: PlanAnswers, basics: PlanBasics | null): AnswerRow[] {
  const text: Record<PlanQuestionId, () => string> = {
    age: () => String(answers.age),
    income: () => incomeText(answers),
    goal: () => GOAL_OPTIONS.find((option) => option.value === answers.goal)?.label ?? 'Not chosen',
    'retire-details': () =>
      `Retire at ${answers.retireAge} on ${randText(answers.retireIncomeMonthly)} a month`,
    'tfsa-details': () =>
      `${randText(answers.tfsaTarget)} target, ${randText(answers.tfsaMonthly)} a month`,
    'emergency-details': () =>
      `${answers.emergencyMonths} ${answers.emergencyMonths === 1 ? 'month' : 'months'} of essentials`,
    risk: () => RISK_LEVELS.find((level) => level.id === answers.risk)?.label ?? '',
    money: () => moneyText(answers, basics),
  };
  return planQuestions(answers).map((id) => ({ id, label: ROW_LABELS[id], value: text[id]() }));
}
