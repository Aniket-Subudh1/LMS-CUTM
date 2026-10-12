import { vi } from 'vitest';

// Integration tests run actions outside a Next request. This stands in for one browser: its cookies and its IP.
export const browser = { cookies: new Map<string, string>(), ip: '203.0.113.1' };

export function switchBrowser(cookies: Map<string, string>, ip = '203.0.113.1') {
  browser.cookies = cookies;
  browser.ip = ip;
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = browser.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...browser.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      if (value === '') browser.cookies.delete(name);
      else browser.cookies.set(name, value);
    },
  }),
  headers: async () => new Headers({ 'x-forwarded-for': browser.ip }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

vi.mock('next/cache', () => ({
  refresh: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
