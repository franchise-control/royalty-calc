/**
 * Вычисление разобранной формулы.
 *
 * Все действия — в точных дробях, поэтому порядок скобок не влияет на
 * последнюю копейку, а результат не зависит от того, в каком порядке сеть
 * записала множители.
 */

import { Rational, RationalError } from './rational';
import { collectVariables, parseFormula, type Node } from './parse';

export class FormulaEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

/**
 * Переменные отчёта.
 *
 * Значения задаются числом или строкой. Строка — для случаев, когда точность
 * важнее удобства: `'0.055'` разбирается как ровно пятьдесят пять тысячных,
 * а `0.055` в double — как чуть большее число.
 */
export type FormulaScope = Readonly<Record<string, number | string | Rational>>;

function toRational(value: number | string | Rational, name: string): Rational {
  try {
    if (value instanceof Rational) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.startsWith('-')
        ? Rational.fromDecimalString(trimmed.slice(1)).negate()
        : Rational.fromDecimalString(trimmed);
    }
    return Rational.fromNumber(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new FormulaEvaluationError(`Переменная «${name}»: ${reason}`);
  }
}

export function evaluateNode(node: Node, scope: FormulaScope): Rational {
  switch (node.kind) {
    case 'number':
      return Rational.fromDecimalString(node.text);

    case 'variable': {
      if (!Object.prototype.hasOwnProperty.call(scope, node.name)) {
        const known = Object.keys(scope).sort().join(', ') || 'нет ни одной';
        throw new FormulaEvaluationError(
          `Переменная «${node.name}» не задана в отчёте. Известные переменные: ${known}`,
        );
      }
      return toRational(scope[node.name]!, node.name);
    }

    case 'negate':
      return evaluateNode(node.operand, scope).negate();

    case 'binary': {
      const left = evaluateNode(node.left, scope);
      const right = evaluateNode(node.right, scope);
      switch (node.operator) {
        case '+':
          return left.add(right);
        case '-':
          return left.subtract(right);
        case '*':
          return left.multiply(right);
        case '/':
          try {
            return left.divide(right);
          } catch (error) {
            if (error instanceof RationalError) {
              throw new FormulaEvaluationError(
                `Деление на ноль в формуле (позиция ${node.position + 1})`,
              );
            }
            throw error;
          }
      }
      break;
    }

    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, scope));
      switch (node.name) {
        case 'min':
          return args.reduce((a, b) => (a.compare(b) <= 0 ? a : b));
        case 'max':
          return args.reduce((a, b) => (a.compare(b) >= 0 ? a : b));
        case 'round':
          return args[0]!.round();
        case 'floor':
          return args[0]!.floor();
        case 'ceil':
          return args[0]!.ceil();
        case 'abs':
          return args[0]!.abs();
        default:
          // До сюда не дойти: разбор пропускает только функции из белого списка.
          throw new FormulaEvaluationError(`Неизвестная функция «${node.name}»`);
      }
    }
  }

  throw new FormulaEvaluationError('Неизвестный узел формулы');
}

/** Разобрать и вычислить формулу за один вызов. Результат — точная дробь. */
export function evaluateFormula(source: string, scope: FormulaScope): Rational {
  return evaluateNode(parseFormula(source), scope);
}

/**
 * Каких переменных не хватает в отчёте, чтобы посчитать формулу.
 *
 * Отдельная функция, потому что проверять надо раньше, чем считать: сказать
 * «в отчёте нет поля „возвраты“» в момент настройки схемы куда полезнее, чем
 * в конце месяца при закрытии начислений.
 */
export function missingVariables(source: string, scope: FormulaScope): string[] {
  return collectVariables(parseFormula(source)).filter(
    (name) => !Object.prototype.hasOwnProperty.call(scope, name),
  );
}
