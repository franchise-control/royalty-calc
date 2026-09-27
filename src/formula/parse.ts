/**
 * Разбор формулы в дерево.
 *
 * Рекурсивный спуск на четыре правила — этого хватает на всё, что встречается
 * в договорах: скобки, четыре действия, несколько функций. Своя реализация, а
 * не `eval` и не готовый вычислитель из npm: формулу пишет пользователь, и
 * `eval` над пользовательским вводом — это исполнение чужого кода в нашем
 * процессе. Здесь выражение физически не может ничего вызвать, кроме функций
 * из белого списка.
 */

import { FormulaSyntaxError, tokenize, type Token } from './tokenize';

export type Node =
  | { readonly kind: 'number'; readonly text: string; readonly position: number }
  | { readonly kind: 'variable'; readonly name: string; readonly position: number }
  | { readonly kind: 'negate'; readonly operand: Node; readonly position: number }
  | {
      readonly kind: 'binary';
      readonly operator: '+' | '-' | '*' | '/';
      readonly left: Node;
      readonly right: Node;
      readonly position: number;
    }
  | {
      readonly kind: 'call';
      readonly name: string;
      readonly args: readonly Node[];
      readonly position: number;
    };

/**
 * Имена функций, которые разрешено вызывать. Регистр не важен.
 *
 * Именно Map, а не объектный литерал: у литерала в прототипе живут
 * `constructor`, `toString` и `valueOf`, и проверка вида `TABLE[name]` для
 * формулы `constructor(1)` вернула бы функцию из прототипа Object. Формулу
 * пишет пользователь, и такая дыра — ровно то, ради чего здесь свой разбор
 * вместо eval.
 */
export const ALLOWED_FUNCTIONS: ReadonlyMap<string, { min: number; max: number }> = new Map([
  ['min', { min: 1, max: Number.POSITIVE_INFINITY }],
  ['max', { min: 1, max: Number.POSITIVE_INFINITY }],
  ['round', { min: 1, max: 1 }],
  ['floor', { min: 1, max: 1 }],
  ['ceil', { min: 1, max: 1 }],
  ['abs', { min: 1, max: 1 }],
]);

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private get current(): Token {
    return this.tokens[this.index]!;
  }

  private advance(): Token {
    const token = this.current;
    if (token.type !== 'end') this.index += 1;
    return token;
  }

  private expect(type: Token['type'], what: string): Token {
    if (this.current.type !== type) {
      throw new FormulaSyntaxError(
        `Ожидалось ${what}, встречено «${this.current.text || 'конец формулы'}»`,
        this.current.position,
      );
    }
    return this.advance();
  }

  parse(): Node {
    const node = this.parseExpression();
    if (this.current.type !== 'end') {
      throw new FormulaSyntaxError(
        `Лишнее выражение после конца формулы: «${this.current.text}»`,
        this.current.position,
      );
    }
    return node;
  }

  private parseExpression(): Node {
    let left = this.parseTerm();
    while (this.current.type === 'operator' && (this.current.text === '+' || this.current.text === '-')) {
      const operator = this.advance();
      const right = this.parseTerm();
      left = {
        kind: 'binary',
        operator: operator.text as '+' | '-',
        left,
        right,
        position: operator.position,
      };
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parseUnary();
    while (this.current.type === 'operator' && (this.current.text === '*' || this.current.text === '/')) {
      const operator = this.advance();
      const right = this.parseUnary();
      left = {
        kind: 'binary',
        operator: operator.text as '*' | '/',
        left,
        right,
        position: operator.position,
      };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.current.type === 'operator' && (this.current.text === '-' || this.current.text === '+')) {
      const operator = this.advance();
      const operand = this.parseUnary();
      return operator.text === '-'
        ? { kind: 'negate', operand, position: operator.position }
        : operand;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.current;

    if (token.type === 'number') {
      this.advance();
      return { kind: 'number', text: token.text, position: token.position };
    }

    if (token.type === 'identifier') {
      this.advance();
      if (this.current.type === 'left-paren') {
        return this.parseCall(token);
      }
      return { kind: 'variable', name: token.text, position: token.position };
    }

    if (token.type === 'left-paren') {
      this.advance();
      const inner = this.parseExpression();
      this.expect('right-paren', 'закрывающая скобка');
      return inner;
    }

    throw new FormulaSyntaxError(
      `Ожидалось число, переменная или скобка, встречено «${token.text || 'конец формулы'}»`,
      token.position,
    );
  }

  private parseCall(name: Token): Node {
    this.expect('left-paren', 'открывающая скобка');
    const args: Node[] = [];

    if (this.current.type !== 'right-paren') {
      args.push(this.parseExpression());
      while (this.current.type === 'comma') {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expect('right-paren', 'закрывающая скобка');

    const normalized = name.text.toLowerCase();
    const arity = ALLOWED_FUNCTIONS.get(normalized);
    if (!arity) {
      const known = [...ALLOWED_FUNCTIONS.keys()].join(', ');
      throw new FormulaSyntaxError(
        `Неизвестная функция «${name.text}». Доступны: ${known}`,
        name.position,
      );
    }
    if (args.length < arity.min || args.length > arity.max) {
      const expected =
        arity.max === Number.POSITIVE_INFINITY
          ? `не меньше ${arity.min}`
          : `${arity.min}`;
      throw new FormulaSyntaxError(
        `Функция «${normalized}» принимает ${expected} аргумент(ов), передано ${args.length}`,
        name.position,
      );
    }

    return { kind: 'call', name: normalized, args, position: name.position };
  }
}

export function parseFormula(source: string): Node {
  if (source.trim() === '') {
    throw new FormulaSyntaxError('Пустая формула', 0);
  }
  return new Parser(tokenize(source)).parse();
}

/** Имена переменных, которые встречаются в формуле. Для проверки отчёта. */
export function collectVariables(node: Node): string[] {
  const found = new Set<string>();
  const walk = (current: Node): void => {
    switch (current.kind) {
      case 'variable':
        found.add(current.name);
        break;
      case 'negate':
        walk(current.operand);
        break;
      case 'binary':
        walk(current.left);
        walk(current.right);
        break;
      case 'call':
        current.args.forEach(walk);
        break;
      case 'number':
        break;
    }
  };
  walk(node);
  return [...found].sort();
}
