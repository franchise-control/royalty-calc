/**
 * Схемы расчёта роялти.
 *
 * Набор закрыт и повторяет то, что реально встречается в договорах
 * коммерческой концессии. Восьмая схема — «роялти не платится»: её проще
 * держать полноправным вариантом, чем расставлять по коду проверки на
 * отсутствие схемы.
 *
 * Разбор схем и того, когда какая уместна:
 * https://franchise-control.pro/uchyot-royalti
 */

import type { BasisPoints, Kopecks, Rounding } from './money';
import type { FormulaScope } from './formula/evaluate';

/** Процент от выручки. Самая частая схема. */
export interface PercentRevenueScheme {
  readonly kind: 'percent-revenue';
  readonly rate: BasisPoints;
}

/** Фиксированная сумма за период, от выручки не зависит. */
export interface FixedScheme {
  readonly kind: 'fixed';
  readonly amount: Kopecks;
}

/** Фиксированная часть плюс процент от выручки. */
export interface FixedPlusPercentScheme {
  readonly kind: 'fixed-plus-percent';
  readonly amount: Kopecks;
  readonly rate: BasisPoints;
}

/** Ставка за единицу объёма: заказ, тонна, квадратный метр. */
export interface PerUnitScheme {
  readonly kind: 'per-unit';
  readonly pricePerUnit: Kopecks;
}

/** Ступень прогрессивной шкалы: ставка начиная с выручки `from`. */
export interface Tier {
  /** Нижняя граница ступени включительно. У первой ступени — ноль. */
  readonly from: Kopecks;
  readonly rate: BasisPoints;
}

/**
 * Прогрессивная шкала по выручке.
 *
 * `marginal` — каждая ступень применяется к своей части выручки, как в
 * подоходном налоге. `flat` — вся выручка считается по ставке той ступени, в
 * которую попала. Разница на границе ступеней огромная, и в договорах
 * встречаются обе формулировки, поэтому режим задаётся явно и умолчания нет.
 */
export interface TieredRevenueScheme {
  readonly kind: 'tiered-revenue';
  readonly mode: 'marginal' | 'flat';
  readonly tiers: readonly Tier[];
}

/** Процент от выручки, но не меньше фиксированной суммы. */
export interface MinGuaranteeScheme {
  readonly kind: 'min-guarantee';
  readonly rate: BasisPoints;
  readonly minimum: Kopecks;
}

/**
 * Произвольная формула по переменным отчёта.
 *
 * Результат формулы трактуется как сумма в копейках: писать формулу в рублях
 * и терять копейку на округлении — ровно то, ради чего эта библиотека
 * существует.
 */
export interface FormulaScheme {
  readonly kind: 'formula';
  readonly expression: string;
}

/** Роялти не платится. */
export interface NoRoyaltyScheme {
  readonly kind: 'none';
}

export type RoyaltyScheme =
  | PercentRevenueScheme
  | FixedScheme
  | FixedPlusPercentScheme
  | PerUnitScheme
  | TieredRevenueScheme
  | MinGuaranteeScheme
  | FormulaScheme
  | NoRoyaltyScheme;

export type RoyaltySchemeKind = RoyaltyScheme['kind'];

/** Все восемь схем — для перебора в интерфейсе и в тестах. */
export const ROYALTY_SCHEME_KINDS = [
  'percent-revenue',
  'fixed',
  'fixed-plus-percent',
  'per-unit',
  'tiered-revenue',
  'min-guarantee',
  'formula',
  'none',
] as const satisfies readonly RoyaltySchemeKind[];

/** Отчёт франчайзи за период. */
export interface Report {
  /** Выручка за период, в копейках. */
  readonly revenue: Kopecks;
  /** Объём для схемы «ставка за единицу»: число заказов, тонн, метров. */
  readonly units?: number;
  /**
   * Дополнительные переменные для схемы «формула».
   *
   * `revenue` и `units` подставляются автоматически, перечислять их здесь не
   * нужно — но если сеть назвала переменную так же, её значение победит.
   */
  readonly variables?: FormulaScope;
}

export interface CalculationOptions {
  /** Правило округления. По умолчанию — к ближайшему, половина вверх. */
  readonly rounding?: Rounding;
  /** Верхняя граница начисления за период, если она есть в договоре. */
  readonly cap?: Kopecks;
}

/**
 * Результат расчёта.
 *
 * `explanation` — не украшение. Спор о сумме роялти начинается с вопроса
 * «откуда взялась эта цифра», и ответ на него должен приходить вместе с
 * цифрой, а не собираться заново по памяти.
 */
export interface RoyaltyResult {
  readonly amount: Kopecks;
  readonly scheme: RoyaltySchemeKind;
  readonly explanation: readonly string[];
}
