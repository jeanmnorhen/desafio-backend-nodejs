import { describe, it, expect } from 'vitest';
import { verifySignatureRaw } from '../signature.js';

describe('Signature Middleware Utils', () => {
  it('deve validar corretamente uma assinatura válida', () => {
    const secret = 'my-secret';
    const payload = '{"hello":"world"}';
    const rawBody = Buffer.from(payload);
    
    // Gerar uma assinatura válida
    const crypto = require('node:crypto');
    const validHash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const signature = `sha256=${validHash}`;

    const isValid = verifySignatureRaw(rawBody, signature, secret);
    expect(isValid).toBe(true);
  });

  it('deve rejeitar uma assinatura inválida', () => {
    const secret = 'my-secret';
    const rawBody = Buffer.from('{"hello":"world"}');
    
    const signature = 'sha256=invalidhash12345';

    const isValid = verifySignatureRaw(rawBody, signature, secret);
    expect(isValid).toBe(false);
  });

  it('deve rejeitar uma assinatura formatada incorretamente ou vazia', () => {
    const secret = 'my-secret';
    const rawBody = Buffer.from('{"hello":"world"}');
    
    expect(verifySignatureRaw(rawBody, '', secret)).toBe(false);
    expect(verifySignatureRaw(rawBody, 'invalid', secret)).toBe(false);
  });
});
