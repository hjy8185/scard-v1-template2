import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

// Simple SQL keyword highlighter (returns HTML string)
export function highlightSQL(sql: string): string {
  const KEYWORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS',
    'NULL', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'WITH', 'CASE',
    'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'CROSS', 'FULL',
    'ASC', 'DESC',
  ]);

  const FUNCTIONS = new Set([
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CAST', 'COALESCE',
    'OVER', 'PARTITION', 'ROW_NUMBER', 'RANK', 'DENSE_RANK',
    'LAG', 'LEAD', 'IFNULL', 'NVL', 'TRIM', 'UPPER', 'LOWER',
    'SUBSTR', 'LENGTH', 'ROUND', 'FLOOR', 'CEIL', 'ABS',
    'DATE', 'YEAR', 'MONTH', 'DAY', 'NOW', 'GETDATE',
    'CONVERT', 'TO_CHAR', 'TO_DATE', 'TO_NUMBER',
  ]);

  // Tokenize first, then colorize each token — avoids regex-on-HTML issues
  // Group 1: single-quoted string, 2: comment, 3: double-quoted identifier (4=inner), 5: word, 6: number, 7: other
  const TOKEN_RE = /('(?:''|[^'])*')|(--.*)|("([^"]*)")|([A-Za-z_ㄱ-ㅎ가-힣][\wㄱ-ㅎ가-힣]*)|(\d+(?:\.\d+)?)|(\S)/g;
  const tokens: string[] = [];
  let lastIdx = 0;

  for (const m of sql.matchAll(TOKEN_RE)) {
    if (m.index! > lastIdx) {
      tokens.push(escapeHtml(sql.slice(lastIdx, m.index!)));
    }
    lastIdx = m.index! + m[0].length;

    if (m[1]) {
      // String literal
      tokens.push(`<span style="color:#CE9178">${escapeHtml(m[1])}</span>`);
    } else if (m[2]) {
      // Comment
      tokens.push(`<span style="color:#6A9955;font-style:italic">${escapeHtml(m[2])}</span>`);
    } else if (m[3]) {
      // Double-quoted identifier — show without quotes, colored as identifier
      const identName = m[4];
      tokens.push(`<span style="color:#9CDCFE">${escapeHtml(identName)}</span>`);
    } else if (m[5]) {
      // Word — check if keyword/function
      const raw = m[5];
      const upper = raw.toUpperCase();
      if (KEYWORDS.has(upper)) {
        tokens.push(`<span style="color:#569CD6;font-weight:600">${escapeHtml(raw)}</span>`);
      } else if (FUNCTIONS.has(upper)) {
        tokens.push(`<span style="color:#DCDCAA">${escapeHtml(raw)}</span>`);
      } else {
        tokens.push(`<span style="color:#9CDCFE">${escapeHtml(raw)}</span>`);
      }
    } else if (m[6]) {
      // Number
      tokens.push(`<span style="color:#B5CEA8">${escapeHtml(m[6])}</span>`);
    } else if (m[7]) {
      // Punctuation / operators
      tokens.push(`<span style="color:#D4D4D4">${escapeHtml(m[7])}</span>`);
    }
  }
  if (lastIdx < sql.length) {
    tokens.push(escapeHtml(sql.slice(lastIdx)));
  }

  return tokens.join('');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}
