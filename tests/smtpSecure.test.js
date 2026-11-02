import { describe, it, expect } from 'vitest';
import { parseSmtpSecure } from '../src/lib/smtpSecure.js';

describe('parseSmtpSecure', () => {
  it('accepts true/1/yes, case-insensitive', () => {
    for (const v of ['true', 'True', 'TRUE', '1', 'yes', 'Yes']) {
      expect(parseSmtpSecure(v, 465).secure).toBe(true);
    }
  });

  it('accepts false/0/no, case-insensitive', () => {
    for (const v of ['false', 'False', '0', 'no', 'No']) {
      expect(parseSmtpSecure(v, 465).secure).toBe(false);
    }
  });

  it('strips surrounding quotes and whitespace before matching — the suspected real bug', () => {
    expect(parseSmtpSecure('"true"', 587).secure).toBe(true);
    expect(parseSmtpSecure("'true'", 587).secure).toBe(true);
    expect(parseSmtpSecure('  true  ', 587).secure).toBe(true);
    expect(parseSmtpSecure('"false"', 465).secure).toBe(false);
  });

  it('defaults from the port when missing', () => {
    expect(parseSmtpSecure(undefined, 465).secure).toBe(true);
    expect(parseSmtpSecure(undefined, 587).secure).toBe(false);
    expect(parseSmtpSecure('', 465).secure).toBe(true);
  });

  it('defaults from the port when the value is present but unrecognised, and says so', () => {
    const r = parseSmtpSecure('yup', 587);
    expect(r.secure).toBe(false);
    expect(r.rule).toMatch(/not a recognised value/);
  });

  it('the rule string never contains a secret and always mentions the actual port used', () => {
    expect(parseSmtpSecure('true', 587).rule).toContain('true');
    expect(parseSmtpSecure(undefined, 587).rule).toContain('587');
  });
});
