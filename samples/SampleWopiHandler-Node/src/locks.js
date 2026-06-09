'use strict';

const { LOCK_TTL_MINUTES } = require('./constants');

/** @type {Map<string, { lock: string, dateCreated: Date }>} */
const locks = new Map();

function isExpired(lockInfo) {
  const expiresAt = new Date(lockInfo.dateCreated);
  expiresAt.setMinutes(expiresAt.getMinutes() + LOCK_TTL_MINUTES);
  return expiresAt < new Date();
}

/**
 * @param {string} fileId
 * @returns {{ lock: string, dateCreated: Date } | null}
 */
function tryGetLock(fileId) {
  const lockInfo = locks.get(fileId);
  if (!lockInfo) {
    return null;
  }

  if (isExpired(lockInfo)) {
    locks.delete(fileId);
    return null;
  }

  return lockInfo;
}

/**
 * @param {string} fileId
 * @param {string} lock
 */
function setLock(fileId, lock) {
  locks.set(fileId, { lock, dateCreated: new Date() });
}

/**
 * @param {string} fileId
 */
function removeLock(fileId) {
  locks.delete(fileId);
}

/**
 * @param {string} fileId
 */
function refreshLock(fileId) {
  const lockInfo = locks.get(fileId);
  if (lockInfo) {
    lockInfo.dateCreated = new Date();
  }
}

/** Clears all locks — exposed for testing only. */
function clearLocks() {
  locks.clear();
}

module.exports = {
  tryGetLock,
  setLock,
  removeLock,
  refreshLock,
  clearLocks,
};
