function identity(message) {
  return JSON.stringify([message.ruleId, message.messageId, message.message, message.severity, message.fatal ?? false]);
}

function excerpt(message, lines) {
  const start = Math.max(0, (message.line ?? 1) - 1);
  const end = Math.min(lines.length, message.endLine ?? message.line ?? 1);
  return lines.slice(start, end).join('\n').trim();
}

export function lineMapping(changes) {
  const mapping = new Map();
  let oldLine = 1;
  let newLine = 1;
  for (const change of changes) {
    if (!change.added && !change.removed) {
      for (let index = 0; index < change.count; index++) mapping.set(newLine + index, oldLine + index);
    }
    if (!change.added) oldLine += change.count;
    if (!change.removed) newLine += change.count;
  }
  return mapping;
}

export function classify(current, baseline, currentSource, baselineSource, changes) {
  const currentLines = currentSource.split(/\r?\n/u);
  const oldLines = baselineSource?.split(/\r?\n/u) ?? [];
  const mapping = lineMapping(changes ?? []);
  const isAvailable = baseline !== undefined && baseline !== null;
  const oldMessages = baseline?.messages ?? [];
  const baselineFailed = oldMessages.some(message => message.fatal);
  const exact = new Map();
  const remaining = new Map();
  for (const old of oldMessages) {
    const key = identity(old);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
    const location = JSON.stringify([key, old.line, old.column, excerpt(old, oldLines)]);
    exact.set(location, (exact.get(location) ?? 0) + 1);
  }
  // Reserve exact matches before considering ambiguous edited or moved findings.
  const matched = current.messages.map(message => {
    const key = identity(message);
    const location = JSON.stringify([key, mapping.get(message.line), message.column, excerpt(message, currentLines)]);
    const count = exact.get(location) ?? 0;
    if (!count) return false;
    exact.set(location, count - 1);
    remaining.set(key, remaining.get(key) - 1);
    return true;
  });
  return current.messages.map((message, index) => {
    const output = {...message};
    if (!isAvailable || baselineFailed || message.fatal || !message.ruleId) {
      return {...output, status: 'unknown', evidence: isAvailable ? 'Parsing or configuration diagnostics prevent reliable comparison.' : 'No baseline available for this file.'};
    }
    if (matched[index] === true) {
      return {...output, status: 'existing', evidence: 'Matched baseline diagnostic on an unchanged, line-mapped source span.'};
    }
    if ((remaining.get(identity(message)) ?? 0) > 0) {
      return {...output, status: 'unknown', evidence: 'A baseline diagnostic with the same identity remains, but edited or moved source prevents an unambiguous location match.'};
    }
    return {...output, status: 'new', evidence: 'No matching diagnostic in the baseline under the same resolved rules and parser configuration.'};
  });
}
