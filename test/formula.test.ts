import { describe, expect, it } from 'vitest';

import { Rational, RationalError } from '../src/formula/rational';
import { FormulaSyntaxError, tokenize } from '../src/formula/tokenize';
import { collectVariables, parseFormula } from '../src/formula/parse';
import {
  FormulaEvaluationError,
  evaluateFormula,
  missingVariables,
} from '../src/formula/evaluate';

describe('точная дробь', () => {
  it('сокращает при создании', () => {
    const value = Rational.of(6n, 4n);
    expect(value.numerator).toBe(3n);
    expect(value.denominator).toBe(2n);
  });

  it('держит знак в числителе', () => {
    const value = Rational.of(1n, -2n);
    expect(value.numerator).toBe(-1n);
    expect(value.denominator).toBe(2n);
  });

  it('не делится на ноль', () => {
    expect(() => Rational.of(1n, 0n)).toThrow(RationalError);
    expect(() => Rational.ONE.divide(Rational.ZERO)).toThrow(RationalError);
  });

  it('складывает точно там, где double врёт', () => {
    const tenth = Rational.fromDecimalString('0.1');
    const fifth = Rational.fromDecimalString('0.2');
    expect(tenth.add(fifth).equals(Rational.fromDecimalString('0.3'))).toBe(true);
    // Для сравнения: в double это неправда.
    expect(0.1 + 0.2 === 0.3).toBe(false);
  });

  it('разбирает десятичную строку без потери точности', () => {
    const value = Rational.fromDecimalString('0.055');
    expect(value.numerator).toBe(11n);
    expect(value.denominator).toBe(200n);
  });

  it('разбирает число', () => {
    expect(Rational.fromNumber(42).equals(Rational.of(42n))).toBe(true);
    expect(Rational.fromNumber(2.5).equals(Rational.of(5n, 2n))).toBe(true);
    expect(Rational.fromNumber(-2.5).equals(Rational.of(-5n, 2n))).toBe(true);
  });

  it('не принимает не-числа', () => {
    expect(() => Rational.fromNumber(Number.NaN)).toThrow(RationalError);
    expect(() => Rational.fromDecimalString('пять')).toThrow(RationalError);
  });

  it('округляет вниз, вверх и к ближайшему, в том числе для отрицательных', () => {
    const minusOneAndHalf = Rational.of(-3n, 2n);
    expect(minusOneAndHalf.floor().toString()).toBe('-2');
    expect(minusOneAndHalf.ceil().toString()).toBe('-1');
    expect(minusOneAndHalf.round().toString()).toBe('-1');
    expect(Rational.of(3n, 2n).round().toString()).toBe('2');
    expect(Rational.of(5n).floor().toString()).toBe('5');
  });

  it('сравнивает', () => {
    expect(Rational.of(1n, 3n).compare(Rational.of(1n, 2n))).toBe(-1);
    expect(Rational.of(1n, 2n).compare(Rational.of(1n, 3n))).toBe(1);
    expect(Rational.of(2n, 4n).compare(Rational.of(1n, 2n))).toBe(0);
  });

  it('превращается в целое только если целая', () => {
    expect(Rational.of(4n, 2n).toBigInt()).toBe(2n);
    expect(() => Rational.of(1n, 2n).toBigInt()).toThrow(RationalError);
  });
});

describe('лексический разбор', () => {
  it('разбирает выражение на лексемы', () => {
    const tokens = tokenize('revenue * 0.05');
    expect(tokens.map((t) => t.type)).toEqual(['identifier', 'operator', 'number', 'end']);
    expect(tokens[2]!.text).toBe('0.05');
  });

  it('достраивает «.5» и «5.» до канонической записи', () => {
    expect(tokenize('.5')[0]!.text).toBe('0.5');
    expect(tokenize('5.')[0]!.text).toBe('5.0');
  });

  it('принимает кириллические имена переменных', () => {
    const tokens = tokenize('выручка - возвраты');
    expect(tokens[0]!.text).toBe('выручка');
    expect(tokens[2]!.text).toBe('возвраты');
  });

  it('сообщает позицию недопустимого символа', () => {
    expect(() => tokenize('revenue $ 5')).toThrow(FormulaSyntaxError);
    try {
      tokenize('revenue $ 5');
      expect.unreachable('должно было упасть');
    } catch (error) {
      expect((error as FormulaSyntaxError).position).toBe(8);
      expect((error as Error).message).toContain('позиция 9');
    }
  });
});

describe('синтаксический разбор', () => {
  it('соблюдает приоритет операций', () => {
    const scope = { a: 2, b: 3, c: 4 };
    expect(evaluateFormula('a + b * c', scope).toString()).toBe('14');
    expect(evaluateFormula('(a + b) * c', scope).toString()).toBe('20');
  });

  it('считает слева направо при равном приоритете', () => {
    expect(evaluateFormula('100 / 5 / 2', {}).toString()).toBe('10');
    expect(evaluateFormula('10 - 3 - 2', {}).toString()).toBe('5');
  });

  it('понимает унарный минус и плюс', () => {
    expect(evaluateFormula('-5 + 8', {}).toString()).toBe('3');
    expect(evaluateFormula('+5', {}).toString()).toBe('5');
    expect(evaluateFormula('- -5', {}).toString()).toBe('5');
  });

  it('собирает имена переменных', () => {
    expect(collectVariables(parseFormula('revenue - returns + revenue'))).toEqual([
      'returns',
      'revenue',
    ]);
  });

  it.each([
    ['', 'Пустая формула'],
    ['revenue +', 'Ожидалось число'],
    ['(revenue', 'закрывающая скобка'],
    ['revenue 5', 'Лишнее выражение'],
    ['revenue)', 'Лишнее выражение'],
  ])('отвергает «%s»', (source, expected) => {
    expect(() => parseFormula(source)).toThrow(FormulaSyntaxError);
    expect(() => parseFormula(source)).toThrow(new RegExp(expected));
  });
});

describe('функции', () => {
  it('считает min, max, round, floor, ceil, abs', () => {
    expect(evaluateFormula('min(3, 1, 2)', {}).toString()).toBe('1');
    expect(evaluateFormula('max(3, 1, 2)', {}).toString()).toBe('3');
    expect(evaluateFormula('round(2.5)', {}).toString()).toBe('3');
    expect(evaluateFormula('floor(2.9)', {}).toString()).toBe('2');
    expect(evaluateFormula('ceil(2.1)', {}).toString()).toBe('3');
    expect(evaluateFormula('abs(0 - 7)', {}).toString()).toBe('7');
  });

  it('не обращает внимания на регистр имени функции', () => {
    expect(evaluateFormula('MIN(4, 9)', {}).toString()).toBe('4');
  });

  it('разделителем аргументов принимает и запятую, и точку с запятой', () => {
    expect(evaluateFormula('max(1; 5)', {}).toString()).toBe('5');
  });

  it('отвергает функцию не из белого списка — формулу пишет пользователь', () => {
    expect(() => parseFormula('eval(1)')).toThrow(/Неизвестная функция/);
    expect(() => parseFormula('constructor(1)')).toThrow(/Неизвестная функция/);
    expect(() => parseFormula('fetch(1)')).toThrow(/Неизвестная функция/);
  });

  it('проверяет число аргументов', () => {
    expect(() => parseFormula('round(1, 2)')).toThrow(/принимает 1 аргумент/);
    expect(() => parseFormula('min()')).toThrow(/не меньше 1/);
  });
});

describe('вычисление', () => {
  it('подставляет переменные', () => {
    expect(evaluateFormula('revenue * 0.05', { revenue: 1_000_000 }).toString()).toBe('50000');
  });

  it('принимает строку как точное значение', () => {
    const asString = evaluateFormula('rate', { rate: '0.055' });
    expect(asString.equals(Rational.of(11n, 200n))).toBe(true);
  });

  it('принимает отрицательную строку', () => {
    expect(evaluateFormula('x', { x: '-2.5' }).toString()).toBe('-5/2');
  });

  it('не подставляет ничего из прототипа Object', () => {
    expect(() => evaluateFormula('toString', {})).toThrow(FormulaEvaluationError);
    expect(() => evaluateFormula('constructor', {})).toThrow(/не задана в отчёте/);
  });

  it('называет известные переменные, когда одной не хватает', () => {
    expect(() => evaluateFormula('returns', { revenue: 1 })).toThrow(/revenue/);
  });

  it('сообщает о делении на ноль с позицией', () => {
    expect(() => evaluateFormula('revenue / 0', { revenue: 10 })).toThrow(
      /Деление на ноль в формуле/,
    );
    expect(() => evaluateFormula('1 / x', { x: 0 })).toThrow(FormulaEvaluationError);
  });

  it('перечисляет, каких переменных не хватает', () => {
    expect(missingVariables('revenue - returns - refunds', { revenue: 1 })).toEqual([
      'refunds',
      'returns',
    ]);
    expect(missingVariables('revenue * 0.05', { revenue: 1 })).toEqual([]);
  });

  it('держит точность на длинной цепочке действий', () => {
    // (1 000 000 − 1) × 0,055 / 3 — в double это 18333.31666666667 с хвостом.
    const value = evaluateFormula('(revenue - 1) * 0.055 / 3', { revenue: 1_000_000 });
    // 999 999 × 11/200 / 3 = 10 999 989/600, после сокращения на 3 — 3 666 663/200.
    expect(value.numerator).toBe(3_666_663n);
    expect(value.denominator).toBe(200n);
    expect(value.toNumber()).toBeCloseTo(18_333.315, 3);
  });
});
