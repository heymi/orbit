export const normalizeIdentifierSeed = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export const buildIdentifier = (seed: string, existing: Set<string>) => {
  const normalized = normalizeIdentifierSeed(seed);
  const base = normalized ? `task-${normalized}` : `task-${Date.now().toString(36)}`;
  let candidate = base;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
};
