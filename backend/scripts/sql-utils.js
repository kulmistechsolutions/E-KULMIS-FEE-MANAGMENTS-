// Utilities for running SQL files safely.
// The main goal is to split SQL into statements WITHOUT breaking:
// - dollar-quoted blocks: $$ ... $$ or $tag$ ... $tag$
// - single/double quoted strings
// - comments (-- and /* */)

export function splitSqlStatements(sqlText) {
  const sql = String(sqlText || '');
  const statements = [];

  let start = 0;
  let i = 0;

  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null; // e.g. '$$' or '$func$'

  const pushStatement = (endIdx) => {
    const chunk = sql.slice(start, endIdx).trim();
    if (chunk) statements.push(chunk);
    start = endIdx + 1;
  };

  const isDollarTagChar = (c) => /[A-Za-z0-9_]/.test(c);

  while (i < sql.length) {
    const c = sql[i];
    const n = i + 1 < sql.length ? sql[i + 1] : '';

    // Comments
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    // Dollar-quoted blocks
    if (dollarTag) {
      const tag = dollarTag;
      if (sql.startsWith(tag, i)) {
        dollarTag = null;
        i += tag.length;
        continue;
      }
      i += 1;
      continue;
    }

    // Strings
    if (inSingle) {
      if (c === "'" && n === "'") {
        i += 2; // escaped single quote
        continue;
      }
      if (c === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (c === '"' && n === '"') {
        i += 2; // escaped double quote in identifier
        continue;
      }
      if (c === '"') inDouble = false;
      i += 1;
      continue;
    }

    // Start of comments
    if (c === '-' && n === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // Start of strings
    if (c === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      i += 1;
      continue;
    }

    // Start of dollar-quote
    if (c === '$') {
      let j = i + 1;
      while (j < sql.length && isDollarTagChar(sql[j])) j += 1;
      if (j < sql.length && sql[j] === '$') {
        dollarTag = sql.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }

    // Statement delimiter
    if (c === ';') {
      pushStatement(i);
      i += 1;
      continue;
    }

    i += 1;
  }

  // tail
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);

  return statements;
}


