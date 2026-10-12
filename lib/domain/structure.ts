import { COMPONENTS } from '@/lib/schemas/structure';

export function componentKey(components: readonly string[]): string {
  return COMPONENTS.filter((c) => components.includes(c)).join('+');
}

export type SchemeDraft = {
  internalMax: number;
  components: readonly { key: string; weight: number; modes: readonly string[]; aggregation: string; bestN?: number }[];
};

// Plain numbers for messages: 0.1 + 0.2 must read as 0.3, not 0.30000000000000004.
const shown = (n: number) => Number(n.toPrecision(12));

// CE-07: every message is shown to the admin as-is; an empty list means the scheme can be saved.
export function validateScheme(scheme: SchemeDraft): string[] {
  const messages: string[] = [];
  const total = scheme.components.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(total - scheme.internalMax) > 1e-9) {
    messages.push(`Weights add up to ${shown(total)}; they must add up to ${shown(scheme.internalMax)}.`);
  }
  const seenKeys = new Set<string>();
  const modeOwner = new Map<string, string>();
  for (const c of scheme.components) {
    if (seenKeys.has(c.key)) messages.push(`The key "${c.key}" is used by more than one component.`);
    seenKeys.add(c.key);
    if (c.modes.length === 0) messages.push(`Component "${c.key}" needs at least one assessment type.`);
    if (c.aggregation === 'best_n' && (c.bestN === undefined || c.bestN < 1)) {
      messages.push(`Component "${c.key}" counts the best N scores, so it needs N (1 or more).`);
    }
    for (const mode of c.modes) {
      const owner = modeOwner.get(mode);
      if (owner !== undefined && owner !== c.key) {
        messages.push(`"${mode}" is counted in both "${owner}" and "${c.key}"; a type belongs to one component.`);
      }
      modeOwner.set(mode, owner ?? c.key);
    }
  }
  return messages;
}

export function defaultOutcomes(): {
  pos: { code: string; title: string }[];
  psos: { code: string; title: string }[];
} {
  return {
    pos: Array.from({ length: 12 }, (_, i) => ({ code: `PO${i + 1}`, title: `PO${i + 1}` })),
    psos: [
      { code: 'PSO1', title: 'Higher education' },
      { code: 'PSO2', title: 'Entrepreneurship' },
      { code: 'PSO3', title: 'Placement' },
    ],
  };
}

export function nextCoCode(existingCodes: readonly string[]): string {
  const highest = existingCodes.reduce((max, code) => {
    const match = /^CO(\d+)$/.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `CO${highest + 1}`;
}
