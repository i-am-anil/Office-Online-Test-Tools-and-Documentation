'use strict';

const crypto = require('crypto');
const modExpToPem = require('rsa-pem-from-mod-exp');

/**
 * @typedef {object} KeyInfo
 * @property {string} cspBlob
 * @property {string} modulus
 * @property {string} exponent
 */

/**
 * @typedef {object} ProofKeyValidationInput
 * @property {string} accessToken
 * @property {number} timestamp
 * @property {string} url
 * @property {string} proof
 * @property {string} oldProof
 */

class ProofKeysHelper {
  /**
   * @param {KeyInfo} current
   * @param {KeyInfo} old
   */
  constructor(current, old) {
    this.currentKey = current;
    this.oldKey = old;
  }

  /**
   * @param {ProofKeyValidationInput} testCase
   * @returns {boolean}
   */
  validate(testCase) {
    const accessTokenBytes = Buffer.from(testCase.accessToken, 'utf8');
    const hostUrlBytes = Buffer.from(testCase.url.toUpperCase(), 'utf8');
    const timeStampBytes = encodeUInt64(testCase.timestamp);

    const expectedProof = Buffer.concat([
      encodeUInt32(accessTokenBytes.length),
      accessTokenBytes,
      encodeUInt32(hostUrlBytes.length),
      hostUrlBytes,
      encodeUInt32(timeStampBytes.length),
      timeStampBytes,
    ]);

    return (
      tryVerification(expectedProof, testCase.proof, this.currentKey.modulus, this.currentKey.exponent) ||
      tryVerification(expectedProof, testCase.oldProof, this.currentKey.modulus, this.currentKey.exponent) ||
      tryVerification(expectedProof, testCase.proof, this.oldKey.modulus, this.oldKey.exponent)
    );
  }
}

/**
 * @param {number} value
 * @returns {Buffer}
 */
function encodeUInt32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value);
  return buf;
}

/**
 * @param {number} value
 * @returns {Buffer}
 */
function encodeUInt64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(value));
  return buf;
}

/**
 * @param {Buffer} expectedProof
 * @param {string} signedProof
 * @param {string} modulusB64
 * @param {string} exponentB64
 * @returns {boolean}
 */
function tryVerification(expectedProof, signedProof, modulusB64, exponentB64) {
  if (!signedProof) {
    return false;
  }

  try {
    const publicKeyPem = modExpToPem(modulusB64, exponentB64);
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(expectedProof);
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(signedProof, 'base64'));
  } catch {
    return false;
  }
}

module.exports = {
  ProofKeysHelper,
  encodeUInt32,
  encodeUInt64,
  tryVerification,
};
