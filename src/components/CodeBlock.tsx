import { useMemo, useState } from 'react';
import './CodeBlock.css';

interface CodeBlockProps {
  language: string;
  code: string;
}

type TokenType = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'operator';

interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'def', 'default',
  'delete', 'elif', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'fn', 'for', 'from',
  'function', 'if', 'impl', 'import', 'in', 'interface', 'let', 'loop', 'match', 'mod', 'mut', 'new',
  'null', 'pub', 'return', 'self', 'static', 'struct', 'super', 'switch', 'throw', 'trait', 'true',
  'try', 'type', 'undefined', 'use', 'var', 'while', 'with', 'yield'
]);

const OPERATORS = new Set(['=', '=>', '==', '===', '!=', '!==', '+', '-', '*', '/', '%', '&&', '||', '!', '?', ':', '.', ',', ';', '|', '&', '>', '<', '>=', '<=']);

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const push = (text: string, type: TokenType) => {
    if (text) tokens.push({ text, type });
  };

  while (index < line.length) {
    const rest = line.slice(index);

    const commentMatch = rest.match(/^(\/\/.*|#.*)/);
    if (commentMatch) {
      push(commentMatch[0], 'comment');
      break;
    }

    const stringMatch = rest.match(/^(['"`])(?:\\.|(?!\1).)*\1/);
    if (stringMatch) {
      push(stringMatch[0], 'string');
      index += stringMatch[0].length;
      continue;
    }

    const numberMatch = rest.match(/^\b\d+(?:\.\d+)?\b/);
    if (numberMatch) {
      push(numberMatch[0], 'number');
      index += numberMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(/^\b[A-Za-z_][A-Za-z0-9_]*\b/);
    if (wordMatch) {
      const word = wordMatch[0];
      push(word, KEYWORDS.has(word) ? 'keyword' : 'plain');
      index += word.length;
      continue;
    }

    const operatorMatch = [...OPERATORS]
      .sort((left, right) => right.length - left.length)
      .find((operator) => rest.startsWith(operator));
    if (operatorMatch) {
      push(operatorMatch, 'operator');
      index += operatorMatch.length;
      continue;
    }

    push(line[index], 'plain');
    index += 1;
  }

  return tokens;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => code.split('\n').map(tokenizeLine), [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-language">{language}</span>
        <button className="code-copy-button" onClick={handleCopy}>
          {copied ? '✓ 已复制' : '📋 复制'}
        </button>
      </div>
      <pre>
        <code>
          {lines.map((line, lineIndex) => (
            <span key={lineIndex} className="code-line">
              <span className="code-line-number">{lineIndex + 1}</span>
              <span className="code-line-content">
                {line.length === 0 ? ' ' : line.map((token, tokenIndex) => (
                  <span key={`${lineIndex}-${tokenIndex}`} className={`token token-${token.type}`}>
                    {token.text}
                  </span>
                ))}
              </span>
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
