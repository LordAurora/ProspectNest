/** Minimal robots.txt evaluation: longest matching Allow/Disallow rule for our agent or `*`. */
export type RobotsRules = { allow: string[]; disallow: string[] };

export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    if (key === 'disallow' && value) current.disallow.push(value);
  }

  const token = agentToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
  };
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(`^${body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`);
  return regex.test(path);
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const longest = (patterns: string[]) => Math.max(-1, ...patterns.filter((p) => matches(p, path)).map((p) => p.length));
  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);
  return disallow < 0 || allow >= disallow;
}
