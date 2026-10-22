/**
 * emailService must not touch the network when it is imported (it is loaded on
 * every boot for SMS). It used to create an Ethereal account — an HTTPS call to
 * api.nodemailer.com — in its constructor, production included, and a
 * production sendEmail would then have delivered to a fake inbox.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import nodemailer from 'nodemailer';

const freshService = async () =>
  (await import(`../../src/lib/emailService.js?lazy=${Date.now()}-${Math.random()}`)).default;

describe('emailService lazy initialisation', () => {
  let savedEnv;
  let createTestAccount;
  let createTransport;

  beforeEach(() => {
    savedEnv = { NODE_ENV: process.env.NODE_ENV, SMTP_USER: process.env.SMTP_USER, SMTP_PASS: process.env.SMTP_PASS };
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    createTestAccount = jest.spyOn(nodemailer, 'createTestAccount')
      .mockResolvedValue({ user: 'eth-user', pass: 'eth-pass' });
    createTransport = jest.spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail: jest.fn(async () => ({ messageId: 'dev-1' })) });
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    jest.restoreAllMocks();
  });

  it('makes no network call when the module is imported', async () => {
    process.env.NODE_ENV = 'production';
    const svc = await freshService();
    expect(createTestAccount).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(svc.isConfigured).toBe(false);
  });

  it('production without SMTP: sendEmail returns the mock result and never uses Ethereal', async () => {
    process.env.NODE_ENV = 'production';
    const svc = await freshService();
    const r = await svc.sendEmail('a@b.com', 's', '<p>h</p>', 't');
    expect(r.success).toBe(true);
    expect(r.messageId).toMatch(/^mock_/);
    expect(r.preview).toBe('Email service not configured');
    expect(createTestAccount).not.toHaveBeenCalled();
    expect((await svc.verifyConnection()).success).toBe(false);
  });

  it('development without SMTP: creates the Ethereal inbox on first send only', async () => {
    process.env.NODE_ENV = 'development';
    const svc = await freshService();
    expect(createTestAccount).not.toHaveBeenCalled();

    const r = await svc.sendEmail('a@b.com', 's', '<p>h</p>', 't');
    expect(r.success).toBe(true);
    expect(r.messageId).toBe('dev-1');
    expect(createTestAccount).toHaveBeenCalledTimes(1);

    await svc.sendEmail('a@b.com', 's2', '<p>h</p>', 't');
    expect(createTestAccount).toHaveBeenCalledTimes(1);
  });

  it('SMTP configured: uses SMTP, never Ethereal', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_USER = 'smtp-user';
    process.env.SMTP_PASS = 'smtp-pass';
    const svc = await freshService();
    const r = await svc.sendEmail('a@b.com', 's', '<p>h</p>', 't');
    expect(r.messageId).toBe('dev-1');
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport.mock.calls[0][0].auth).toEqual({ user: 'smtp-user', pass: 'smtp-pass' });
    expect(createTestAccount).not.toHaveBeenCalled();
  });
});
