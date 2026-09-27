/**
 * Деньги и ставки.
 *
 * Почему не обычные числа с копейками после запятой. 0.1 + 0.2 в double даёт
 * 0.30000000000000004, и на сумме роялти за год расхождение вылезает в акт,
 * который подписывают две стороны. Поэтому деньги здесь — целое число копеек,
 * а ставка — целое число базисных пунктов. Дробных величин в вычислениях нет
 * вообще, кроме одного деления в самом конце, и у него явно задано правило
 * округления.
 *
 * Базисный пункт (б.п.) — сотая доля процента: 10 000 б.п. = 100 %,
 * 550 б.п. = 5,5 %. Так пишут ставки в банковских и франчайзинговых
 * договорах, и так ставку нельзя случайно задать как 0.055 вместо 5.5.
 */

/**
 * Сумма в минимальных единицах валюты (копейках). Целое число.
 *
 * Тип помечен, чтобы рубли нельзя было передать туда, где ждут копейки:
 * `calculateRoyalty({ revenue: 100000 })` — это тысяча рублей, а не сто тысяч,
 * и компилятор заставит написать это явно через `rubles(1000)` или
 * `kopecks(100000)`.
 */
export type Kopecks = number & { readonly __brand: 'Kopecks' };

/** Ставка в базисных пунктах. Целое число, 10 000 = 100 %. */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' };

/** 100 % в базисных пунктах. */
export const FULL_RATE = 10_000;

/** Правило округления при делении. */
export type Rounding =
  /** К ближайшему, половина вверх (0,5 → 1). Как в бухгалтерии по умолчанию. */
  | 'half-up'
  /** К ближайшему, половина к чётному. Меньше системного перекоса на больших объёмах. */
  | 'half-even'
  /** Вниз, в пользу франчайзи. */
  | 'floor'
  /** Вверх, в пользу управляющей компании. */
  | 'ceil';

export const DEFAULT_ROUNDING: Rounding = 'half-up';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${what}: ожидалось конечное число, получено ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `${what}: ожидалось целое число, получено ${value}. ` +
        'Суммы задаются в копейках, ставки — в базисных пунктах.',
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `${what}: значение ${value} за пределами точного диапазона целых чисел`,
    );
  }
}

/** Сумма в копейках. Целое, не отрицательное. */
export function kopecks(value: number): Kopecks {
  assertSafeInteger(value, 'Сумма в копейках');
  if (value < 0) {
    throw new MoneyError(`Сумма в копейках: отрицательное значение ${value}`);
  }
  return value as Kopecks;
}

/**
 * Сумма в рублях — в копейки.
 *
 * Принимает дробное: 1234.56 рубля превращается в 123 456 копеек. Больше двух
 * знаков после запятой — ошибка, а не тихое округление: если в договоре
 * написано 1234.567, это опечатка, и лучше узнать о ней здесь.
 */
export function rubles(value: number): Kopecks {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Сумма в рублях: ожидалось конечное число, получено ${value}`);
  }
  // Умножаем через округление, а не напрямую: 19.99 * 100 в double даёт
  // 1998.9999999999998, и Math.trunc отрезал бы копейку.
  const asKopecks = Math.round(value * 100);
  if (Math.abs(asKopecks - value * 100) > 1e-6) {
    throw new MoneyError(
      `Сумма в рублях: ${value} — больше двух знаков после запятой`,
    );
  }
  return kopecks(asKopecks);
}

/** Ставка в базисных пунктах: 550 = 5,5 %. */
export function basisPoints(value: number): BasisPoints {
  assertSafeInteger(value, 'Ставка в базисных пунктах');
  if (value < 0) {
    throw new MoneyError(`Ставка в базисных пунктах: отрицательное значение ${value}`);
  }
  return value as BasisPoints;
}

/**
 * Ставка в процентах — в базисные пункты.
 *
 * Больше двух знаков после запятой не принимаем по той же причине, что и у
 * рублей: 5.5 % — это 550 б.п., а 5.555 % в договорах не встречается и почти
 * всегда означает ошибку ввода.
 */
export function percent(value: number): BasisPoints {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Ставка в процентах: ожидалось конечное число, получено ${value}`);
  }
  const bp = Math.round(value * 100);
  if (Math.abs(bp - value * 100) > 1e-6) {
    throw new MoneyError(`Ставка в процентах: ${value} — больше двух знаков после запятой`);
  }
  return basisPoints(bp);
}

/**
 * Деление целых с заданным округлением.
 *
 * Единственное место во всей библиотеке, где появляется дробь, — и потому
 * единственное, где правило округления имеет значение. Знаменатель всегда
 * положительный (это либо 10 000 базисных пунктов, либо количество единиц).
 */
export function divideRound(
  numerator: number,
  denominator: number,
  rounding: Rounding = DEFAULT_ROUNDING,
): number {
  if (denominator <= 0) {
    throw new MoneyError(`Деление: знаменатель должен быть положительным, получен ${denominator}`);
  }

  const quotient = Math.floor(numerator / denominator);
  const remainder = numerator - quotient * denominator;
  if (remainder === 0) return quotient;

  switch (rounding) {
    case 'floor':
      return quotient;
    case 'ceil':
      return quotient + 1;
    case 'half-up':
      return remainder * 2 >= denominator ? quotient + 1 : quotient;
    case 'half-even': {
      const twice = remainder * 2;
      if (twice > denominator) return quotient + 1;
      if (twice < denominator) return quotient;
      return quotient % 2 === 0 ? quotient : quotient + 1;
    }
    default: {
      const exhaustive: never = rounding;
      throw new MoneyError(`Неизвестное правило округления: ${String(exhaustive)}`);
    }
  }
}

/**
 * Процент от суммы: `amount` × `rate` базисных пунктов.
 *
 * Умножаем до деления — тогда промежуточный результат остаётся целым и
 * округление происходит ровно один раз, в конце.
 */
export function applyRate(
  amount: Kopecks,
  rate: BasisPoints,
  rounding: Rounding = DEFAULT_ROUNDING,
): Kopecks {
  const product = amount * rate;
  assertSafeInteger(product, 'Произведение суммы на ставку');
  return kopecks(divideRound(product, FULL_RATE, rounding));
}

/** Сложение сумм с проверкой на выход за точный диапазон. */
export function addKopecks(...values: Kopecks[]): Kopecks {
  const sum = values.reduce<number>((acc, v) => acc + v, 0);
  assertSafeInteger(sum, 'Сумма слагаемых');
  return kopecks(sum);
}

/** Копейки — в рубли, для вывода. Возвращает строку, а не число: печатать. */
export function formatRubles(value: Kopecks): string {
  const whole = Math.floor(value / 100);
  const fraction = value - whole * 100;
  return `${whole},${String(fraction).padStart(2, '0')}`;
}
