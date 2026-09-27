/**
 * Разбор формулы на лексемы.
 *
 * Отдельный проход, а не разбор символ за символом внутри парсера: когда в
 * формуле опечатка, пользователю надо сказать, где именно, а позиция лексемы
 * для этого нужна с самого начала.
 */

export type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'left-paren'
  | 'right-paren'
  | 'comma'
  | 'end';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  /** Позиция первого символа лексемы в исходной строке, с нуля. */
  readonly position: number;
}

export class FormulaSyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} (позиция ${position + 1})`);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

const OPERATORS = new Set(['+', '-', '*', '/']);

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/**
 * Первый символ имени переменной.
 *
 * Кириллица разрешена намеренно: переменные отчёта сеть называет так, как ей
 * удобно, и `выручка * 0.05` для российской сети читается лучше, чем
 * транслитерация.
 */
function isIdentifierStart(char: string): boolean {
  return /[A-Za-zА-Яа-яЁё_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char) || char === '.';
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(source[index + 1] ?? ''))) {
      const start = index;
      let seenDot = false;
      while (index < source.length) {
        const c = source[index]!;
        if (isDigit(c)) {
          index += 1;
        } else if (c === '.' && !seenDot) {
          seenDot = true;
          index += 1;
        } else {
          break;
        }
      }
      let text = source.slice(start, index);
      // «.5» и «5.» — обычные опечатки, а не ошибка: дописываем ноль,
      // чтобы дальше разбор работал с канонической записью.
      if (text.startsWith('.')) text = `0${text}`;
      if (text.endsWith('.')) text = `${text}0`;
      tokens.push({ type: 'number', text, position: start });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      while (index < source.length && isIdentifierPart(source[index]!)) {
        index += 1;
      }
      tokens.push({ type: 'identifier', text: source.slice(start, index), position: start });
      continue;
    }

    if (OPERATORS.has(char)) {
      tokens.push({ type: 'operator', text: char, position: index });
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'left-paren', text: char, position: index });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'right-paren', text: char, position: index });
      index += 1;
      continue;
    }

    if (char === ',' || char === ';') {
      tokens.push({ type: 'comma', text: char, position: index });
      index += 1;
      continue;
    }

    throw new FormulaSyntaxError(`Недопустимый символ «${char}»`, index);
  }

  tokens.push({ type: 'end', text: '', position: source.length });
  return tokens;
}
