'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  ProofKeysHelper,
  encodeUInt32,
  encodeUInt64,
} = require('../src/proofKeyHelper');

function buildExpectedProof(accessToken, url, timestamp) {
  const accessTokenBytes = Buffer.from(accessToken, 'utf8');
  const hostUrlBytes = Buffer.from(url.toUpperCase(), 'utf8');
  const timeStampBytes = encodeUInt64(timestamp);

  return Buffer.concat([
    encodeUInt32(accessTokenBytes.length),
    accessTokenBytes,
    encodeUInt32(hostUrlBytes.length),
    hostUrlBytes,
    encodeUInt32(timeStampBytes.length),
    timeStampBytes,
  ]);
}

describe('ProofKeysHelper', () => {
  it('round-trips sign and verify with a generated RSA key pair', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const publicJwk = publicKey.export({ format: 'jwk' });
    const modulusB64 = Buffer.from(publicJwk.n, 'base64url').toString('base64');
    const exponentB64 = Buffer.from(publicJwk.e, 'base64url').toString('base64');

    const accessToken = 'test-token-123';
    const url =
      'https://contoso.com/wopi/files/sample.docx?access_token=test-token-123';
    const timestamp = 635655897610773532;
    const expectedProof = buildExpectedProof(accessToken, url, timestamp);

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(expectedProof);
    signer.end();
    const proof = signer.sign(privateKey, 'base64');

    const helper = new ProofKeysHelper(
      { cspBlob: '', modulus: modulusB64, exponent: exponentB64 },
      { cspBlob: '', modulus: modulusB64, exponent: exponentB64 }
    );

    assert.equal(
      helper.validate({
        accessToken,
        timestamp,
        url,
        proof,
        oldProof: 'invalid',
      }),
      true
    );
  });

  it('rejects tampered proof payloads', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const publicJwk = publicKey.export({ format: 'jwk' });
    const modulusB64 = Buffer.from(publicJwk.n, 'base64url').toString('base64');
    const exponentB64 = Buffer.from(publicJwk.e, 'base64url').toString('base64');

    const accessToken = 'valid';
    const url = 'https://contoso.com/wopi/files/a?access_token=valid';
    const expectedProof = buildExpectedProof(accessToken, url, 12345);

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(expectedProof);
    const proof = signer.sign(privateKey, 'base64');

    const helper = new ProofKeysHelper(
      { cspBlob: '', modulus: modulusB64, exponent: exponentB64 },
      { cspBlob: '', modulus: modulusB64, exponent: exponentB64 }
    );

    assert.equal(
      helper.validate({
        accessToken: 'tampered',
        timestamp: 12345,
        url,
        proof,
        oldProof: proof,
      }),
      false
    );
  });

  it('encodes length prefixes as big-endian uint32', () => {
    assert.deepEqual(encodeUInt32(200), Buffer.from([0, 0, 0, 200]));
    assert.deepEqual(encodeUInt32(8), Buffer.from([0, 0, 0, 8]));
  });

  it('encodes timestamps as big-endian uint64', () => {
    const encoded = encodeUInt64(635655897610773532);
    assert.equal(encoded.length, 8);
    assert.equal(encoded.toString('hex'), '08d24dabc878e400');
  });
});
