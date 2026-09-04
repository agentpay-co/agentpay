import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => {
  vi.resetModules();
  delete process.env.CORS_ORIGINS;
  delete process.env.NODE_ENV;
});

async function loadApp() {
  const mod = await import('./server.js');
  return mod.app as import('express').Express;
}

describe('registry CORS policy', () => {
  it('echoes an allowlisted origin and blocks others', async () => {
    process.env.CORS_ORIGINS = 'https://allowed.example';
    process.env.NODE_ENV = 'test';
    const app = await loadApp();

    const ok = await request(app).get('/health').set('Origin', 'https://allowed.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://allowed.example');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses to boot permissive in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(loadApp()).rejects.toThrow(/CORS_ORIGINS/);
  });
});
