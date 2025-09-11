import { maskSensitiveInfo, isMaskingEnabled } from '../pii.js';

describe('maskSensitiveInfo env toggle', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV }; // shallow copy
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('masks by default when env var not set', () => {
    delete process.env.MASK_SENSITIVE_INFO;
    const input = 'Contact me at test.user@example.com or +1 (555) 123-4567';
    const output = maskSensitiveInfo(input);
    expect(output).toContain('[EMAIL REDACTED]');
    expect(output).toContain('[PHONE REDACTED]');
  });

  it('does not mask when env var explicitly disabled', () => {
    process.env.MASK_SENSITIVE_INFO = 'false';
    const input = 'Email: test.user@example.com Phone: +1 (555) 123-4567';
    const output = maskSensitiveInfo(input);
    expect(output).toBe(input);
  });

  it('treats arbitrary value as enabled (safety)', () => {
    process.env.MASK_SENSITIVE_INFO = 'weird';
    const input = 'Email: test.user@example.com';
    const output = maskSensitiveInfo(input);
    expect(output).toContain('[EMAIL REDACTED]');
  });

  it('handles numeric truthy/falsey values', () => {
    process.env.MASK_SENSITIVE_INFO = '0';
    expect(isMaskingEnabled()).toBe(false);
    process.env.MASK_SENSITIVE_INFO = '1';
    expect(isMaskingEnabled()).toBe(true);
  });
});
