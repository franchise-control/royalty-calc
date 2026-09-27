import { describe, expect, it } from 'vitest';

import { RoyaltyError, calculateRoyalty, effectiveRate } from '../src/calculate';
import { kopecks, percent, rubles } from '../src/money';
import { ROYALTY_SCHEME_KINDS, type RoyaltyScheme } from '../src/schemes';

const report = (revenue: number, extra: Record<string, unknown> = {}) => ({
  revenue: rubles(revenue),
  ...extra,
});

describe('роялти не платится', () => {
  it('даёт ноль и говорит об этом', () => {
    const result = calculateRoyalty({ kind: 'none' }, report(1_000_000));
    expect(result.amount).toBe(0);
    expect(result.explanation.join(' ')).toContain('не платится');
  });
});

describe('процент от выручки', () => {
  it('считает ровный процент', () => {
    const result = calculateRoyalty({ kind: 'percent-revenue', rate: percent(5) }, report(1_000_000));
    expect(result.amount).toBe(rubles(50_000));
  });

  it('считает дробную ставку', () => {
    const result = calculateRoyalty(
      { kind: 'percent-revenue', rate: percent(5.5) },
      report(333.33),
    );
    expect(result.amount).toBe(1833);
  });

  it('объясняет расчёт одной строкой', () => {
    const result = calculateRoyalty({ kind: 'percent-revenue', rate: percent(5) }, report(1000));
    expect(result.explanation).toEqual(['1000,00 ₽ × 5 % = 50,00 ₽']);
  });

  it('печатает дробную ставку без лишнего нуля', () => {
    const result = calculateRoyalty({ kind: 'percent-revenue', rate: percent(5.5) }, report(1000));
    expect(result.explanation[0]).toContain('5,5 %');
  });

  it('печатает сотые доли процента полностью', () => {
    const result = calculateRoyalty(
      { kind: 'percent-revenue', rate: percent(5.05) },
      report(1000),
    );
    expect(result.explanation[0]).toContain('5,05 %');
  });
});

describe('фиксированная сумма', () => {
  it('не зависит от выручки', () => {
    const scheme: RoyaltyScheme = { kind: 'fixed', amount: rubles(30_000) };
    expect(calculateRoyalty(scheme, report(0)).amount).toBe(rubles(30_000));
    expect(calculateRoyalty(scheme, report(10_000_000)).amount).toBe(rubles(30_000));
  });
});

describe('фикс плюс процент', () => {
  it('складывает обе части', () => {
    const result = calculateRoyalty(
      { kind: 'fixed-plus-percent', amount: rubles(20_000), rate: percent(3) },
      report(1_000_000),
    );
    expect(result.amount).toBe(rubles(50_000));
    expect(result.explanation).toHaveLength(3);
  });
});

describe('ставка за единицу объёма', () => {
  it('умножает ставку на объём', () => {
    const result = calculateRoyalty(
      { kind: 'per-unit', pricePerUnit: rubles(12.5) },
      report(0, { units: 400 }),
    );
    expect(result.amount).toBe(rubles(5_000));
  });

  it('требует объём в отчёте', () => {
    expect(() =>
      calculateRoyalty({ kind: 'per-unit', pricePerUnit: rubles(10) }, report(1000)),
    ).toThrow(/не указан объём/);
  });

  it('не принимает дробный и отрицательный объём', () => {
    const scheme: RoyaltyScheme = { kind: 'per-unit', pricePerUnit: rubles(10) };
    expect(() => calculateRoyalty(scheme, report(0, { units: 1.5 }))).toThrow(RoyaltyError);
    expect(() => calculateRoyalty(scheme, report(0, { units: -1 }))).toThrow(RoyaltyError);
  });

  it('нулевой объём даёт ноль', () => {
    const result = calculateRoyalty(
      { kind: 'per-unit', pricePerUnit: rubles(10) },
      report(0, { units: 0 }),
    );
    expect(result.amount).toBe(0);
  });
});

describe('прогрессивная шкала', () => {
  const tiers = [
    { from: kopecks(0), rate: percent(6) },
    { from: rubles(1_000_000), rate: percent(4) },
    { from: rubles(3_000_000), rate: percent(2) },
  ];

  it('в маргинальном режиме считает каждую ступень от своей части', () => {
    // 1 000 000 × 6 % + 1 000 000 × 4 % = 60 000 + 40 000
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers },
      report(2_000_000),
    );
    expect(result.amount).toBe(rubles(100_000));
  });

  it('в маргинальном режиме использует все три ступени', () => {
    // 1 000 000 × 6 % + 2 000 000 × 4 % + 1 000 000 × 2 %
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers },
      report(4_000_000),
    );
    expect(result.amount).toBe(rubles(160_000));
  });

  it('в плоском режиме считает всю выручку по ставке своей ступени', () => {
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'flat', tiers },
      report(2_000_000),
    );
    expect(result.amount).toBe(rubles(80_000));
  });

  it('на границе ступени режимы расходятся — ради этого режим и задаётся явно', () => {
    const marginal = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers },
      report(1_000_000),
    );
    const flat = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'flat', tiers },
      report(1_000_000),
    );
    expect(marginal.amount).toBe(rubles(60_000));
    expect(flat.amount).toBe(rubles(40_000));
  });

  it('сортирует ступени сама', () => {
    const shuffled = [tiers[2]!, tiers[0]!, tiers[1]!];
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers: shuffled },
      report(2_000_000),
    );
    expect(result.amount).toBe(rubles(100_000));
  });

  it('требует, чтобы первая ступень начиналась с нуля', () => {
    expect(() =>
      calculateRoyalty(
        {
          kind: 'tiered-revenue',
          mode: 'marginal',
          tiers: [{ from: rubles(100), rate: percent(5) }],
        },
        report(1000),
      ),
    ).toThrow(/должна начинаться с нуля/);
  });

  it('не принимает две ступени с одной границей', () => {
    expect(() =>
      calculateRoyalty(
        {
          kind: 'tiered-revenue',
          mode: 'marginal',
          tiers: [
            { from: kopecks(0), rate: percent(5) },
            { from: kopecks(0), rate: percent(7) },
          ],
        },
        report(1000),
      ),
    ).toThrow(/одной границей/);
  });

  it('не принимает пустую шкалу', () => {
    expect(() =>
      calculateRoyalty({ kind: 'tiered-revenue', mode: 'marginal', tiers: [] }, report(1000)),
    ).toThrow(/ни одной ступени/);
  });

  it('объясняет расчёт по ступеням', () => {
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers },
      report(2_000_000),
    );
    expect(result.explanation).toHaveLength(3);
    expect(result.explanation.at(-1)).toContain('Итого по шкале');
  });

  it('нулевая выручка даёт ноль', () => {
    const result = calculateRoyalty(
      { kind: 'tiered-revenue', mode: 'marginal', tiers },
      report(0),
    );
    expect(result.amount).toBe(0);
  });
});

describe('процент не ниже минимума', () => {
  const scheme: RoyaltyScheme = {
    kind: 'min-guarantee',
    rate: percent(5),
    minimum: rubles(30_000),
  };

  it('берёт ставку, когда она выше минимума', () => {
    const result = calculateRoyalty(scheme, report(1_000_000));
    expect(result.amount).toBe(rubles(50_000));
    expect(result.explanation.at(-1)).toContain('выше минимума');
  });

  it('берёт минимум, когда ставка ниже', () => {
    const result = calculateRoyalty(scheme, report(100_000));
    expect(result.amount).toBe(rubles(30_000));
    expect(result.explanation.at(-1)).toContain('начислен минимум');
  });

  it('на точном равенстве берёт ставку', () => {
    const result = calculateRoyalty(scheme, report(600_000));
    expect(result.amount).toBe(rubles(30_000));
    expect(result.explanation.at(-1)).toContain('выше минимума');
  });
});

describe('произвольная формула', () => {
  it('считает по переменным отчёта', () => {
    const result = calculateRoyalty(
      { kind: 'formula', expression: '(revenue - returns) * 0.05' },
      { revenue: rubles(1_000_000), variables: { returns: rubles(100_000) } },
    );
    expect(result.amount).toBe(rubles(45_000));
  });

  it('подставляет revenue и units без перечисления', () => {
    const result = calculateRoyalty(
      { kind: 'formula', expression: 'revenue * 0.01 + units * 500' },
      { revenue: rubles(100_000), units: 10 },
    );
    // 10 000 000 копеек × 0,01 = 100 000 копеек; 10 × 500 копеек = 5 000.
    expect(result.amount).toBe(105_000);
  });

  it('позволяет сети переопределить revenue своим значением', () => {
    const result = calculateRoyalty(
      { kind: 'formula', expression: 'revenue' },
      { revenue: rubles(1000), variables: { revenue: 777 } },
    );
    expect(result.amount).toBe(777);
  });

  it('округляет дробный результат по общему правилу', () => {
    const half: RoyaltyScheme = { kind: 'formula', expression: '1 / 2' };
    expect(calculateRoyalty(half, report(0)).amount).toBe(1);
    expect(calculateRoyalty(half, report(0), { rounding: 'floor' }).amount).toBe(0);
  });

  it('отвергает отрицательный результат', () => {
    expect(() =>
      calculateRoyalty({ kind: 'formula', expression: 'revenue - 1' }, { revenue: kopecks(0) }),
    ).toThrow(/отрицательный результат/);
  });

  it('передаёт наверх ошибку разбора', () => {
    expect(() =>
      calculateRoyalty({ kind: 'formula', expression: 'revenue *' }, report(1000)),
    ).toThrow(/Ожидалось число/);
  });
});

describe('потолок начисления', () => {
  it('срезает сумму до потолка', () => {
    const result = calculateRoyalty(
      { kind: 'percent-revenue', rate: percent(10) },
      report(1_000_000),
      { cap: rubles(70_000) },
    );
    expect(result.amount).toBe(rubles(70_000));
    expect(result.explanation.at(-1)).toContain('выше потолка');
  });

  it('не трогает сумму ниже потолка', () => {
    const result = calculateRoyalty(
      { kind: 'percent-revenue', rate: percent(5) },
      report(1_000_000),
      { cap: rubles(70_000) },
    );
    expect(result.amount).toBe(rubles(50_000));
    expect(result.explanation.join(' ')).not.toContain('потолка');
  });

  it('потолок работает и для фиксированной суммы', () => {
    const result = calculateRoyalty({ kind: 'fixed', amount: rubles(100_000) }, report(0), {
      cap: rubles(10_000),
    });
    expect(result.amount).toBe(rubles(10_000));
  });
});

describe('эффективная ставка', () => {
  it('показывает, во сколько процентов обошлась схема', () => {
    const rep = report(2_000_000);
    const result = calculateRoyalty(
      {
        kind: 'tiered-revenue',
        mode: 'marginal',
        tiers: [
          { from: kopecks(0), rate: percent(6) },
          { from: rubles(1_000_000), rate: percent(4) },
        ],
      },
      rep,
    );
    // 100 000 из 2 000 000 — это 5 %, то есть 500 базисных пунктов.
    expect(effectiveRate(result, rep)).toBe(500);
  });

  it('при нулевой выручке ставка не определена', () => {
    const rep = report(0);
    const result = calculateRoyalty({ kind: 'fixed', amount: rubles(30_000) }, rep);
    expect(effectiveRate(result, rep)).toBeNull();
  });
});

describe('полнота набора схем', () => {
  it('каждая схема из списка считается без исключения', () => {
    const samples: Record<(typeof ROYALTY_SCHEME_KINDS)[number], RoyaltyScheme> = {
      'percent-revenue': { kind: 'percent-revenue', rate: percent(5) },
      fixed: { kind: 'fixed', amount: rubles(1000) },
      'fixed-plus-percent': {
        kind: 'fixed-plus-percent',
        amount: rubles(1000),
        rate: percent(1),
      },
      'per-unit': { kind: 'per-unit', pricePerUnit: rubles(10) },
      'tiered-revenue': {
        kind: 'tiered-revenue',
        mode: 'marginal',
        tiers: [{ from: kopecks(0), rate: percent(5) }],
      },
      'min-guarantee': { kind: 'min-guarantee', rate: percent(5), minimum: rubles(100) },
      formula: { kind: 'formula', expression: 'revenue * 0.05' },
      none: { kind: 'none' },
    };

    expect(Object.keys(samples).sort()).toEqual([...ROYALTY_SCHEME_KINDS].sort());

    for (const kind of ROYALTY_SCHEME_KINDS) {
      const result = calculateRoyalty(samples[kind], report(100_000, { units: 3 }));
      expect(result.scheme).toBe(kind);
      expect(result.amount).toBeGreaterThanOrEqual(0);
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  });
});
