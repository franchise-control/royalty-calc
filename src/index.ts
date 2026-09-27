/**
 * royalty-calc — расчёт роялти во франчайзинговой сети.
 *
 * Восемь схем из договоров коммерческой концессии, точная арифметика без
 * чисел с плавающей точкой и объяснение, откуда взялась сумма.
 *
 * Библиотека вынесена из платформы Franchise Control и живёт отдельно:
 * https://franchise-control.pro/uchyot-royalti
 */

export {
  kopecks,
  rubles,
  basisPoints,
  percent,
  applyRate,
  addKopecks,
  divideRound,
  formatRubles,
  MoneyError,
  FULL_RATE,
  DEFAULT_ROUNDING,
  type Kopecks,
  type BasisPoints,
  type Rounding,
} from './money';

export {
  ROYALTY_SCHEME_KINDS,
  type RoyaltyScheme,
  type RoyaltySchemeKind,
  type PercentRevenueScheme,
  type FixedScheme,
  type FixedPlusPercentScheme,
  type PerUnitScheme,
  type TieredRevenueScheme,
  type MinGuaranteeScheme,
  type FormulaScheme,
  type NoRoyaltyScheme,
  type Tier,
  type Report,
  type CalculationOptions,
  type RoyaltyResult,
} from './schemes';

export { calculateRoyalty, effectiveRate, RoyaltyError } from './calculate';

export {
  evaluateFormula,
  missingVariables,
  FormulaEvaluationError,
  type FormulaScope,
} from './formula/evaluate';
export { parseFormula, collectVariables, ALLOWED_FUNCTIONS, type Node } from './formula/parse';
export { tokenize, FormulaSyntaxError, type Token } from './formula/tokenize';
export { Rational, RationalError } from './formula/rational';
