/**
 * Расчёт роялти по схеме из договора.
 *
 * Вход — схема и отчёт франчайзи за период, выход — сумма в копейках и
 * человеческое объяснение, как она получилась.
 */

import {
  DEFAULT_ROUNDING,
  FULL_RATE,
  addKopecks,
  applyRate,
  divideRound,
  formatRubles,
  kopecks,
  type Kopecks,
  type Rounding,
} from './money';
import { evaluateFormula } from './formula/evaluate';
import { Rational } from './formula/rational';
import type {
  CalculationOptions,
  Report,
  RoyaltyResult,
  RoyaltyScheme,
  Tier,
  TieredRevenueScheme,
} from './schemes';

export class RoyaltyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoyaltyError';
  }
}

function rate(bp: number): string {
  // 550 б.п. печатаем как «5,5 %», 500 — как «5 %»: лишний ноль в акте
  // выглядит так, будто ставку правили руками.
  const whole = Math.floor(bp / 100);
  const fraction = bp - whole * 100;
  if (fraction === 0) return `${whole} %`;
  const tail = fraction % 10 === 0 ? String(fraction / 10) : String(fraction).padStart(2, '0');
  return `${whole},${tail} %`;
}

function money(value: Kopecks): string {
  return `${formatRubles(value)} ₽`;
}

/**
 * Прогрессивная шкала.
 *
 * Ступени сортируются здесь, а не требуются отсортированными: порядок в
 * договоре бывает любым, и падать из-за него библиотека не должна. А вот две
 * ступени с одной границей — это уже неоднозначность, и её мы не прощаем.
 */
function normalizeTiers(tiers: readonly Tier[]): Tier[] {
  if (tiers.length === 0) {
    throw new RoyaltyError('Прогрессивная шкала: не задано ни одной ступени');
  }
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  if (sorted[0]!.from !== 0) {
    throw new RoyaltyError(
      `Прогрессивная шкала: первая ступень должна начинаться с нуля, ` +
        `а начинается с ${money(sorted[0]!.from)}`,
    );
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.from === sorted[i - 1]!.from) {
      throw new RoyaltyError(
        `Прогрессивная шкала: две ступени с одной границей ${money(sorted[i]!.from)}`,
      );
    }
  }
  return sorted;
}

function calculateTiered(
  scheme: TieredRevenueScheme,
  revenue: Kopecks,
  rounding: Rounding,
  explanation: string[],
): Kopecks {
  const tiers = normalizeTiers(scheme.tiers);

  if (scheme.mode === 'flat') {
    // Ступень, в которую попала выручка: последняя, чья граница не выше её.
    let chosen = tiers[0]!;
    for (const tier of tiers) {
      if (revenue >= tier.from) chosen = tier;
    }
    const amount = applyRate(revenue, chosen.rate, rounding);
    explanation.push(
      `Выручка ${money(revenue)} попадает в ступень от ${money(chosen.from)} — ` +
        `ставка ${rate(chosen.rate)} на всю выручку`,
      `${money(revenue)} × ${rate(chosen.rate)} = ${money(amount)}`,
    );
    return amount;
  }

  // Маргинальный режим: каждая ступень считается от своей части выручки.
  let total = 0;
  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]!;
    if (revenue <= tier.from) break;

    const upper = i + 1 < tiers.length ? Math.min(tiers[i + 1]!.from, revenue) : revenue;
    const slice = kopecks(upper - tier.from);
    if (slice === 0) continue;

    const part = applyRate(slice, tier.rate, rounding);
    total += part;
    const bound = i + 1 < tiers.length ? `до ${money(kopecks(upper))}` : 'и выше';
    explanation.push(
      `От ${money(tier.from)} ${bound}: ${money(slice)} × ${rate(tier.rate)} = ${money(part)}`,
    );
  }
  return kopecks(total);
}

/**
 * Посчитать роялти за период.
 *
 * @throws {RoyaltyError} если схема и отчёт не сходятся — например, схема
 * «ставка за единицу», а объём в отчёте не указан.
 */
export function calculateRoyalty(
  scheme: RoyaltyScheme,
  report: Report,
  options: CalculationOptions = {},
): RoyaltyResult {
  const rounding = options.rounding ?? DEFAULT_ROUNDING;
  const explanation: string[] = [];
  let amount: Kopecks;

  switch (scheme.kind) {
    case 'none':
      explanation.push('Роялти по договору не платится');
      amount = kopecks(0);
      break;

    case 'percent-revenue':
      amount = applyRate(report.revenue, scheme.rate, rounding);
      explanation.push(`${money(report.revenue)} × ${rate(scheme.rate)} = ${money(amount)}`);
      break;

    case 'fixed':
      amount = scheme.amount;
      explanation.push(`Фиксированная сумма за период: ${money(amount)}`);
      break;

    case 'fixed-plus-percent': {
      const variable = applyRate(report.revenue, scheme.rate, rounding);
      amount = addKopecks(scheme.amount, variable);
      explanation.push(
        `Фиксированная часть: ${money(scheme.amount)}`,
        `Переменная часть: ${money(report.revenue)} × ${rate(scheme.rate)} = ${money(variable)}`,
        `Итого: ${money(scheme.amount)} + ${money(variable)} = ${money(amount)}`,
      );
      break;
    }

    case 'per-unit': {
      const units = report.units;
      if (units === undefined) {
        throw new RoyaltyError(
          'Схема «ставка за единицу»: в отчёте не указан объём (поле units)',
        );
      }
      if (!Number.isInteger(units) || units < 0) {
        throw new RoyaltyError(
          `Схема «ставка за единицу»: объём должен быть целым неотрицательным числом, получен ${units}`,
        );
      }
      amount = kopecks(scheme.pricePerUnit * units);
      explanation.push(
        `${units} × ${money(scheme.pricePerUnit)} за единицу = ${money(amount)}`,
      );
      break;
    }

    case 'tiered-revenue':
      amount = calculateTiered(scheme, report.revenue, rounding, explanation);
      explanation.push(`Итого по шкале: ${money(amount)}`);
      break;

    case 'min-guarantee': {
      const byRate = applyRate(report.revenue, scheme.rate, rounding);
      amount = byRate >= scheme.minimum ? byRate : scheme.minimum;
      explanation.push(
        `По ставке: ${money(report.revenue)} × ${rate(scheme.rate)} = ${money(byRate)}`,
        `Минимум по договору: ${money(scheme.minimum)}`,
        byRate >= scheme.minimum
          ? `Ставка выше минимума, начислено ${money(amount)}`
          : `Ставка ниже минимума, начислен минимум ${money(amount)}`,
      );
      break;
    }

    case 'formula': {
      const scope = {
        revenue: Rational.of(BigInt(report.revenue)),
        units: Rational.of(BigInt(report.units ?? 0)),
        ...report.variables,
      };
      const value = evaluateFormula(scheme.expression, scope);
      if (value.compare(Rational.ZERO) < 0) {
        throw new RoyaltyError(
          `Формула «${scheme.expression}» дала отрицательный результат ${value.toString()}`,
        );
      }
      // Дробь превращаем в копейки тем же правилом округления, что и всё
      // остальное: иначе формула считалась бы по своим законам.
      const numerator = Number(value.numerator);
      const denominator = Number(value.denominator);
      if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
        throw new RoyaltyError(
          `Формула «${scheme.expression}» дала значение вне точного диапазона: ${value.toString()}`,
        );
      }
      amount = kopecks(divideRound(numerator, denominator, rounding));
      explanation.push(`Формула «${scheme.expression}» = ${money(amount)}`);
      break;
    }

    default: {
      const exhaustive: never = scheme;
      throw new RoyaltyError(`Неизвестная схема: ${JSON.stringify(exhaustive)}`);
    }
  }

  if (options.cap !== undefined && amount > options.cap) {
    explanation.push(
      `Начисление ${money(amount)} выше потолка по договору ${money(options.cap)} — ` +
        `начислен потолок`,
    );
    amount = options.cap;
  }

  return { amount, scheme: scheme.kind, explanation };
}

/**
 * Эффективная ставка: сколько процентов от выручки составило начисление.
 *
 * Нужна не для акта, а для разговора. «У вас прогрессивная шкала, по факту это
 * 4,3 % от выручки» — понятнее, чем список ступеней, и сразу видно, если схема
 * на практике работает не так, как её задумывали.
 *
 * Возвращает базисные пункты. При нулевой выручке — null: ставка не определена,
 * а ноль здесь солгал бы.
 */
export function effectiveRate(result: RoyaltyResult, report: Report): number | null {
  if (report.revenue === 0) return null;
  return divideRound(result.amount * FULL_RATE, report.revenue, 'half-up');
}
