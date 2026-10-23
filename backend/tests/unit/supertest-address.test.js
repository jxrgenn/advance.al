/**
 * Guards the jest.setup.js supertest fix for random mid-test 401s.
 *
 * supertest binds its server to the IPv6 wildcard [::] and used to send every
 * request to 127.0.0.1:<port>. macOS lets [::]:<port> be bound while another
 * program holds 127.0.0.1:<port> (VS Code helpers do), so the request reached
 * that program and came back 401. Here a decoy plays that program.
 */
import { describe, it, expect } from '@jest/globals';
import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import request from 'supertest';

describe('test harness — supertest talks to the server under test', () => {
  it('a decoy holding 127.0.0.1:<port> does not receive the request', async () => {
    const decoy = http.createServer((req, res) => { res.statusCode = 401; res.end('decoy'); });
    decoy.listen(0, '127.0.0.1');
    await once(decoy, 'listening');
    const { port } = decoy.address();

    const app = express();
    app.get('/whoami', (req, res) => res.json({ app: 'under-test' }));
    const server = http.createServer(app);
    const bound = await new Promise((resolve) => {
      server.once('error', (err) => resolve(err.code));
      server.listen(port, () => resolve('bound'));
    });
    try {
      if (bound !== 'bound') {
        // JUSTIFIED: on Linux (CI) the OS refuses [::]:<port> while 127.0.0.1:<port>
        // is taken, so the collision cannot happen there at all.
        expect(bound).toBe('EADDRINUSE');
        return;
      }
      expect(server.address()).toMatchObject({ address: '::', port });
      const r = await request(server).get('/whoami');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ app: 'under-test' });
    } finally {
      server.close();
      decoy.close();
    }
  });

  it('a plain request(app) still works', async () => {
    const app = express();
    app.get('/ping', (req, res) => res.json({ pong: true }));
    const r = await request(app).get('/ping');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ pong: true });
  });
});
