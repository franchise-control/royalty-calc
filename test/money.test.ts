import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROUNDING,
  MoneyError,
  addKopecks,
  applyRate,
  basisPoints,
  divideRound,
  formatRubles,
  kopecks,
  percent,
  rubles,
} from '../src/money';

describe('копейки', () => {
  it('принимает целые неотрицательные', () => {
    expect(kopecks(0)).toBe(0);
    expect(kopecks(123_456)).toBe(123_456);
  });

  it('не принимает дробные — это почти всегда рубли вместо копеек', () => {
    expect(() => kopecks(10.5)).toThrow(MoneyError);
    expect(() => kopecks(10.5)).toThrow(/целое число/);
  });

  it('не принимает отрицательные', () => {
    expect(() => kopecks(-1)).toThrow(MoneyError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'не принимает %s',
    (value) => {
      expect(() => kopecks(value)).toThrow(MoneyError);
    },
  );

  it('не принимает значения за границей точных целых', () => {
    expect(() => kopecks(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe('рубли в копейки', () => {
  it('переводит без потери копейки там, где double ошибается', () => {
    // 19.99 * 100 в double даёт 1998.9999999999998.
    expect(rubles(19.99)).toBe(1999);
    expect(rubles(0.07)).toBe(7);
    expect(rubles(1234.56)).toBe(123_456);
  });

  it('принимает целые рубли', () => {
    expect(rubles(1000)).toBe(100_000);
    expect(rubles(0)).toBe(0);
  });

  it('отвергает третий знак после запятой вместо тихого округления', () => {
    expect(() => rubles(1234.567)).toThrow(/двух знаков/);
  });
});

describe('ставки', () => {
  it('переводит проценты в базисные пункты', () => {
    expect(percent(5)).toBe(500);
    expect(percent(5.5)).toBe(550);
    expect(percent(0.01)).toBe(1);
    expect(percent(100)).toBe(10_000);
  });

  it('отвергает третий знак после запятой', () => {
    expect(() => percent(5.555)).toThrow(/двух знаков/);
  });

  it('принимает базисные пункты напрямую', () => {
    expect(basisPoints(550)).toBe(550);
    expect(() => basisPoints(5.5)).toThrow(MoneyError);
  });
});

describe('деление с округлением', () => {
  it('округляет половину вверх', () => {
    expect(divideRound(5, 2, 'half-up')).toBe(3);
    expect(divideRound(4, 2, 'half-up')).toBe(2);
    expect(divideRound(3, 2, 'half-up')).toBe(2);
  });

  it('округляет половину к чётному', () => {
    expect(divideRound(5, 2, 'half-even')).toBe(2);
    expect(divideRound(7, 2, 'half-even')).toBe(4);
    expect(divideRound(6, 4, 'half-even')).toBe(2);
    expect(divideRound(10, 4, 'half-even')).toBe(2);
  });

  it('округляет вниз и вверх', () => {
    expect(divideRound(7, 2, 'floor')).toBe(3);
    expect(divideRound(7, 2, 'ceil')).toBe(4);
    expect(divideRound(6, 2, 'ceil')).toBe(3);
  });

  it('не делит на ноль и на отрицательное', () => {
    expect(() => divideRound(1, 0)).toThrow(MoneyError);
    expect(() => divideRound(1, -2)).toThrow(MoneyError);
  });

  it('по умолчанию округляет половину вверх', () => {
    expect(DEFAULT_ROUNDING).toBe('half-up');
    expect(divideRound(5, 2)).toBe(divideRound(5, 2, 'half-up'));
  });
});

describe('процент от суммы', () => {
  it('считает ровный случай', () => {
    expect(applyRate(kopecks(100_000), percent(5))).toBe(5_000);
  });

  it('округляет один раз в конце, а не на каждом шаге', () => {
    // 333.33 ₽ × 5,5 % = 18.33315 ₽ → 1833 копейки при округлении вверх половины.
    expect(applyRate(rubles(333.33), percent(5.5))).toBe(1833);
  });

  it('уважает правило округления', () => {
    // 1 копейка × 50 % = 0,5 копейки.
    expect(applyRate(kopecks(1), percent(50), 'half-up')).toBe(1);
    expect(applyRate(kopecks(1), percent(50), 'floor')).toBe(0);
    expect(applyRate(kopecks(1), percent(50), 'half-even')).toBe(0);
    expect(applyRate(kopecks(3), percent(50), 'half-even')).toBe(2);
  });

  it('нулевая ставка и нулевая сумма дают ноль', () => {
    expect(applyRate(kopecks(100_000), percent(0))).toBe(0);
    expect(applyRate(kopecks(0), percent(5))).toBe(0);
  });

  it('падает, если произведение выходит за точный диапазон', () => {
    expect(() => applyRate(kopecks(Number.MAX_SAFE_INTEGER), percent(100))).toThrow(MoneyError);
  });
});

describe('сложение', () => {
  it('складывает', () => {
    expect(addKopecks(kopecks(100), kopecks(250), kopecks(1))).toBe(351);
  });

  it('пустой список даёт ноль', () => {
    expect(addKopecks()).toBe(0);
  });
});

describe('вывод рублей', () => {
  it.each([
    [0, '0,00'],
    [7, '0,07'],
    [70, '0,70'],
    [1999, '19,99'],
    [123_456, '1234,56'],
  ])('%i копеек печатается как %s', (value, expected) => {
    expect(formatRubles(kopecks(value))).toBe(expected);
  });
});
