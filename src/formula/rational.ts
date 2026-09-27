/**
 * Точная дробь на bigint.
 *
 * Зачем она в калькуляторе роялти. Схема «произвольная формула» позволяет
 * написать что-то вроде `(revenue - returns) * 0.055 / 3`, и в double такое
 * выражение теряет копейки на каждом шаге. Здесь все промежуточные значения —
 * несократимые дроби из целых bigint, и округление происходит ровно один раз,
 * когда результат превращается в копейки.
 *
 * Знаменатель всегда положительный, дробь всегда сокращена: два одинаковых по
 * величине значения сравниваются как равные без допуска.
 */

export class RationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RationalError';
  }
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    this.numerator = numerator;
    this.denominator = denominator;
  }

  static of(numerator: bigint, denominator: bigint = 1n): Rational {
    if (denominator === 0n) {
      throw new RationalError('Деление на ноль');
    }
    let n = numerator;
    let d = denominator;
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    if (g > 1n) {
      n /= g;
      d /= g;
    }
    return new Rational(n, d);
  }

  /**
   * Десятичная запись — в точную дробь.
   *
   * Через строку, а не через умножение на 10^k: `0.055 * 1000` в double даёт
   * 55.00000000000001, и вся затея с точностью теряет смысл в первой же
   * строке разбора.
   */
  static fromDecimalString(text: string): Rational {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) {
      throw new RationalError(`Не число: «${text}»`);
    }
    const whole = match[1];
    const fraction = match[2] ?? '';
    const digits = BigInt(whole + fraction);
    const scale = 10n ** BigInt(fraction.length);
    return Rational.of(digits, scale);
  }

  static fromNumber(value: number): Rational {
    if (!Number.isFinite(value)) {
      throw new RationalError(`Не число: ${value}`);
    }
    if (Number.isInteger(value)) {
      return Rational.of(BigInt(value));
    }
    // Точное десятичное представление double: toFixed(20) теряет хвост,
    // поэтому идём через экспоненциальную запись самого значения.
    const sign = value < 0 ? -1n : 1n;
    const decimal = Math.abs(value).toString();
    if (decimal.includes('e') || decimal.includes('E')) {
      throw new RationalError(
        `Значение ${value} записано в экспоненциальной форме; задайте его строкой`,
      );
    }
    const positive = Rational.fromDecimalString(decimal);
    return Rational.of(sign * positive.numerator, positive.denominator);
  }

  static readonly ZERO = Rational.of(0n);
  static readonly ONE = Rational.of(1n);

  add(other: Rational): Rational {
    return Rational.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Rational): Rational {
    return Rational.of(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Rational): Rational {
    return Rational.of(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: Rational): Rational {
    if (other.numerator === 0n) {
      throw new RationalError('Деление на ноль');
    }
    return Rational.of(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  negate(): Rational {
    return Rational.of(-this.numerator, this.denominator);
  }

  abs(): Rational {
    return this.numerator < 0n ? this.negate() : this;
  }

  /** −1, 0 или 1. */
  compare(other: Rational): -1 | 0 | 1 {
    const left = this.numerator * other.denominator;
    const right = other.numerator * this.denominator;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  equals(other: Rational): boolean {
    return this.compare(other) === 0;
  }

  isInteger(): boolean {
    return this.denominator === 1n;
  }

  /** Вниз до целого, в том числе для отрицательных (−1,5 → −2). */
  floor(): Rational {
    const q = this.numerator / this.denominator;
    const exact = q * this.denominator === this.numerator;
    return Rational.of(exact || this.numerator > 0n ? q : q - 1n);
  }

  ceil(): Rational {
    return this.negate().floor().negate();
  }

  /** К ближайшему целому, половина вверх (−0,5 → 0, как Math.round). */
  round(): Rational {
    return this.add(Rational.of(1n, 2n)).floor();
  }

  /**
   * В целое число — если дробь целая. Иначе ошибка: превращать дробь в целое
   * молча значит потерять копейки там, где их никто не ищет.
   */
  toBigInt(): bigint {
    if (!this.isInteger()) {
      throw new RationalError(`Дробное значение ${this.toString()} не является целым`);
    }
    return this.numerator;
  }

  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  toString(): string {
    return this.denominator === 1n
      ? this.numerator.toString()
      : `${this.numerator}/${this.denominator}`;
  }
}
