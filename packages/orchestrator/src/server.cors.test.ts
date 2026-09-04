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

describe('orchestrator CORS policy', () => {
  it('echoes an allowlisted origin and blocks others', async () => {
    process.env.CORS_ORIGINS = 'https://dashboard.example.com';
    process.env.NODE_ENV = 'test';
    const app = await loadApp();

    const ok = await request(app).get('/health').set('Origin', 'https://dashboard.example.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://dashboard.example.com');

    const blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
