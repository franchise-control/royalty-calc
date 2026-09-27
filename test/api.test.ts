/**
 * Проверки публичного интерфейса и краевых случаев.
 *
 * Отдельный файл, потому что проверяет не поведение отдельной функции, а
 * договор пакета: что именно из него можно импортировать и что происходит на
 * границах, куда обычные сценарии не доходят.
 */

import { describe, expect, it } from 'vitest';

import * as api from '../src/index';
import { Rational, RationalError } from '../src/formula/rational';
import { MoneyError, divideRound } from '../src/money';
import { collectVariables, parseFormula } from '../src/formula/parse';
import { evaluateFormula } from '../src/formula/evaluate';
import { calculateRoyalty } from '../src/calculate';

describe('публичный интерфейс', () => {
  it('отдаёт всё, что обещает README', () => {
    for (const name of [
      'calculateRoyalty',
      'effectiveRate',
      'kopecks',
      'rubles',
      'percent',
      'basisPoints',
      'applyRate',
      'addKopecks',
      'divideRound',
      'formatRubles',
      'evaluateFormula',
      'missingVariables',
      'parseFormula',
      'collectVariables',
      'tokenize',
      'Rational',
      'ROYALTY_SCHEME_KINDS',
      'ALLOWED_FUNCTIONS',
      'FULL_RATE',
      'DEFAULT_ROUNDING',
    ]) {
      expect(api, `нет экспорта ${name}`).toHaveProperty(name);
    }
  });

  it('отдаёт классы ошибок — их ловят по типу, а не по тексту', () => {
    for (const name of [
      'MoneyError',
      'RoyaltyError',
      'FormulaSyntaxError',
      'FormulaEvaluationError',
      'RationalError',
    ]) {
      expect(api, `нет экспорта ${name}`).toHaveProperty(name);
    }
  });

  it('пример из README считается ровно так, как написано', () => {
    const result = api.calculateRoyalty(
      { kind: 'min-guarantee', rate: api.percent(5), minimum: api.rubles(30_000) },
      { revenue: api.rubles(400_000) },
    );
    expect(api.formatRubles(result.amount)).toBe('30000,00');
    expect(api.effectiveRate(result, { revenue: api.rubles(400_000) })).toBe(750);
  });
});

describe('краевые случаи денег', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rubles(%s) — ошибка', (value) => {
    expect(() => api.rubles(value)).toThrow(MoneyError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('percent(%s) — ошибка', (value) => {
    expect(() => api.percent(value)).toThrow(MoneyError);
  });

  it('отрицательная ставка — ошибка', () => {
    expect(() => api.basisPoints(-1)).toThrow(MoneyError);
    expect(() => api.percent(-5)).toThrow(MoneyError);
  });

  it('неизвестное правило округления — ошибка, а не молчаливое умолчание', () => {
    expect(() => divideRound(5, 2, 'к-ближайшей-пятнице' as never)).toThrow(MoneyError);
  });

  it('сложение за границей точных целых — ошибка', () => {
    const huge = api.kopecks(Number.MAX_SAFE_INTEGER);
    expect(() => api.addKopecks(huge, huge)).toThrow(MoneyError);
  });
});

describe('краевые случаи дробей', () => {
  it('дробь в экспоненциальной записи просят задать строкой', () => {
    // Меньше 1e-6 JS печатает как «1e-7», и разбирать эту запись в точную
    // дробь мы не беремся — лучше попросить строку, чем угадать.
    expect(() => Rational.fromNumber(1e-7)).toThrow(RationalError);
    expect(() => Rational.fromNumber(1.5e-7)).toThrow(RationalError);
    // А строкой — пожалуйста.
    expect(Rational.fromDecimalString('0.0000001').denominator).toBe(10_000_000n);
  });

  it('большое целое проходит: экспоненциальная запись мешает только дробям', () => {
    expect(Rational.fromNumber(1e21).toString()).toBe('1000000000000000000000');
  });

  it('печатает целую дробь без знаменателя', () => {
    expect(Rational.of(4n, 2n).toString()).toBe('2');
    expect(Rational.of(1n, 3n).toString()).toBe('1/3');
  });

  it('переводится в число для вывода', () => {
    expect(Rational.of(1n, 4n).toNumber()).toBe(0.25);
  });
});

describe('обход дерева формулы', () => {
  it('находит переменные под унарным минусом и внутри вызова', () => {
    expect(collectVariables(parseFormula('-revenue'))).toEqual(['revenue']);
    expect(collectVariables(parseFormula('max(revenue, min(bonus, 10))'))).toEqual([
      'bonus',
      'revenue',
    ]);
    expect(collectVariables(parseFormula('2 + 2'))).toEqual([]);
  });

  it('вычисляет переменную, заданную готовой дробью', () => {
    const value = evaluateFormula('rate * 100', { rate: Rational.of(1n, 8n) });
    expect(value.toString()).toBe('25/2');
  });
});

describe('плохое значение переменной', () => {
  it('называет переменную, а не только причину', () => {
    expect(() => evaluateFormula('x + 1', { x: Number.NaN })).toThrow(/Переменная «x»/);
    expect(() => evaluateFormula('x + 1', { x: 'не число' })).toThrow(/Переменная «x»/);
    expect(() => evaluateFormula('x + 1', { x: '1.2.3' })).toThrow(/Переменная «x»/);
  });
});

describe('переполнение в формуле', () => {
  it('сообщает, что результат вне точного диапазона, вместо тихой потери точности', () => {
    expect(() =>
      calculateRoyalty(
        { kind: 'formula', expression: 'revenue * 1000000000' },
        { revenue: api.kopecks(1_000_000_000) },
      ),
    ).toThrow(/вне точного диапазона/);
  });
});
