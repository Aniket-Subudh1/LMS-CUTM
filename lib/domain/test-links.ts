// M04b (TP-01, TP-02): the rules of share links and where a test lives.

// A course's assessment lives under its course; a standalone test under the Tests page.
export function assessmentPath(offeringId: string | null, assessmentId: string): string {
  return offeringId ? `/courses/${offeringId}/assessments/${assessmentId}` : `/tests/${assessmentId}`;
}

export type LinkState = 'open' | 'off' | 'expired' | 'full';

// Whether a link still lets people in: turned on, not past its expiry, under its use limit.
export function linkState(
  link: { active: boolean; expiresAt: Date | null; maxUses: number | null; uses: number },
  now: Date,
): LinkState {
  if (!link.active) return 'off';
  if (link.expiresAt && now >= link.expiresAt) return 'expired';
  if (link.maxUses !== null && link.uses >= link.maxUses) return 'full';
  return 'open';
}

// "riya.p@gmail.com" → "ri••••@gmail.com": enough for its owner to recognise, on a page anyone with the link opens.
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, Math.min(2, Math.max(1, at - 1)))}••••${email.slice(at)}`;
}

// An empty list allows any email; otherwise the address's domain must be one of them (no subdomains).
export function emailAllowed(email: string, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return domains.includes(domain);
}
