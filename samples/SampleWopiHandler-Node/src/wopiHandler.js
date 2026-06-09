'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const { RequestType, WopiHeaders } = require('./constants');
const { parseRequest } = require('./wopiRequest');
const { tryGetLock, setLock, removeLock, refreshLock } = require('./locks');

function validateWopiProofKey(_req) {
  // TODO: Wire ProofKeysHelper here. See ProofKeyHelper.cs / proofKeyHelper.js.
  return true;
}

/**
 * @param {import('./wopiRequest').WopiRequest} requestData
 * @param {boolean} writeAccessRequired
 */
function validateAccess(requestData, writeAccessRequired) {
  void writeAccessRequired;
  const token = requestData.accessToken;
  return token && token.trim() !== '' && token !== 'INVALID';
}

/**
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function getFileVersion(filename) {
  const stats = await fsp.stat(filename);
  return stats.mtime.toISOString();
}

function returnStatus(res, code, description) {
  res.status(code);
  res.statusMessage = description;
}

function returnSuccess(res) {
  returnStatus(res, 200, 'Success');
}

function returnInvalidToken(res) {
  returnStatus(res, 401, 'Invalid Token');
}

function returnFileUnknown(res) {
  returnStatus(res, 404, 'File Unknown/User Unauthorized');
}

function returnServerError(res) {
  returnStatus(res, 500, 'Server Error');
}

function returnUnsupported(res) {
  returnStatus(res, 501, 'Unsupported');
}

/**
 * @param {import('express').Response} res
 * @param {string | null | undefined} existingLock
 * @param {string | null | undefined} reason
 */
function returnLockMismatch(res, existingLock = null, reason = null) {
  res.setHeader(WopiHeaders.Lock, existingLock || '');
  if (reason) {
    res.setHeader(WopiHeaders.LockFailureReason, reason);
  }
  returnStatus(res, 409, 'Lock mismatch/Locked by another interface');
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleCheckFileInfoRequest(req, res, requestData) {
  if (!validateAccess(requestData, false)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    const stats = await fsp.stat(requestData.fullPath);
    const directoryName = path.dirname(requestData.fullPath);
    const folderName = path.basename(directoryName);

    const responseData = {
      BaseFileName: path.basename(requestData.fullPath),
      OwnerId: 'documentOwnerId',
      Size: stats.size,
      UserId: 'user@contoso.com',
      Version: stats.mtime.toISOString(),
      BreadcrumbBrandName: 'LocalStorage WOPI Host',
      BreadcrumbFolderName: folderName,
      BreadcrumbDocName: path.parse(requestData.fullPath).name,
      BreadcrumbBrandUrl: `http://${req.hostname}`,
      BreadcrumbFolderUrl: `http://${req.hostname}`,
      UserFriendlyName: 'A WOPI User',
      SupportsLocks: true,
      SupportsUpdate: true,
      UserCanNotWriteRelative: true,
      ReadOnly: !(stats.mode & 0o200),
      UserCanWrite: Boolean(stats.mode & 0o200),
    };

    returnSuccess(res);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(responseData));
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleGetFileRequest(req, res, requestData) {
  if (!validateAccess(requestData, false)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    await fsp.access(requestData.fullPath, fs.constants.R_OK);
    const version = await getFileVersion(requestData.fullPath);
    returnSuccess(res);
    res.setHeader(WopiHeaders.ItemVersion, version);
    return res.sendFile(path.resolve(requestData.fullPath));
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handlePutFileRequest(req, res, requestData) {
  if (!validateAccess(requestData, true)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    const stats = await fsp.stat(requestData.fullPath);
    const newLock = req.get(WopiHeaders.Lock) || '';
    const existingLock = tryGetLock(requestData.id);

    if (existingLock && existingLock.lock !== newLock) {
      returnLockMismatch(res, existingLock.lock);
      return res.end();
    }

    if (!existingLock && stats.size !== 0) {
      returnLockMismatch(
        res,
        null,
        'PutFile on unlocked file with current size != 0'
      );
      return res.end();
    }

    const fileStream = fs.createWriteStream(requestData.fullPath, { flags: 'w' });
    await pipeline(req, fileStream);

    const version = await getFileVersion(requestData.fullPath);
    returnSuccess(res);
    res.setHeader(WopiHeaders.ItemVersion, version);
    return res.end();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    if (err.code === 'EIO') {
      returnServerError(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleLockRequest(req, res, requestData) {
  if (!validateAccess(requestData, true)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    await fsp.access(requestData.fullPath, fs.constants.F_OK);
    const newLock = req.get(WopiHeaders.Lock) || '';
    const existingLock = tryGetLock(requestData.id);

    if (existingLock && existingLock.lock !== newLock) {
      returnLockMismatch(res, existingLock.lock);
      return res.end();
    }

    if (existingLock) {
      removeLock(requestData.id);
    }

    setLock(requestData.id, newLock);

    const version = await getFileVersion(requestData.fullPath);
    returnSuccess(res);
    res.setHeader(WopiHeaders.ItemVersion, version);
    return res.end();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleRefreshLockRequest(req, res, requestData) {
  if (!validateAccess(requestData, true)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    await fsp.access(requestData.fullPath, fs.constants.F_OK);
    const newLock = req.get(WopiHeaders.Lock) || '';
    const existingLock = tryGetLock(requestData.id);

    if (!existingLock) {
      returnLockMismatch(res, null, 'File not locked');
      return res.end();
    }

    if (existingLock.lock !== newLock) {
      returnLockMismatch(res, existingLock.lock);
      return res.end();
    }

    refreshLock(requestData.id);
    returnSuccess(res);
    return res.end();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleUnlockRequest(req, res, requestData) {
  if (!validateAccess(requestData, true)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    await fsp.access(requestData.fullPath, fs.constants.F_OK);
    const newLock = req.get(WopiHeaders.Lock) || '';
    const existingLock = tryGetLock(requestData.id);

    if (!existingLock) {
      returnLockMismatch(res, null, 'File not locked');
      return res.end();
    }

    if (existingLock.lock !== newLock) {
      returnLockMismatch(res, existingLock.lock);
      return res.end();
    }

    removeLock(requestData.id);
    const version = await getFileVersion(requestData.fullPath);
    returnSuccess(res);
    res.setHeader(WopiHeaders.ItemVersion, version);
    return res.end();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleUnlockAndRelockRequest(req, res, requestData) {
  if (!validateAccess(requestData, true)) {
    returnInvalidToken(res);
    return res.end();
  }

  try {
    await fsp.access(requestData.fullPath, fs.constants.F_OK);
    const newLock = req.get(WopiHeaders.Lock) || '';
    const oldLock = req.get(WopiHeaders.OldLock) || '';
    const existingLock = tryGetLock(requestData.id);

    if (!existingLock) {
      returnLockMismatch(res, null, 'File not locked');
      return res.end();
    }

    if (existingLock.lock !== oldLock) {
      returnLockMismatch(res, existingLock.lock);
      return res.end();
    }

    setLock(requestData.id, newLock);
    returnSuccess(res);
    res.setHeader(WopiHeaders.OldLock, newLock);
    return res.end();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      returnFileUnknown(res);
      return res.end();
    }
    throw err;
  }
}

const unsupportedTypes = new Set([
  RequestType.PutRelativeFile,
  RequestType.EnumerateChildren,
  RequestType.CheckFolderInfo,
  RequestType.DeleteFile,
  RequestType.ExecuteCobaltRequest,
  RequestType.GetRestrictedLink,
  RequestType.ReadSecureStore,
  RequestType.RevokeRestrictedLink,
]);

/**
 * Main WOPI request processor — equivalent to WopiHandler.ProcessRequest.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function processWopiRequest(req, res, next) {
  try {
    if (!validateWopiProofKey(req)) {
      returnServerError(res);
      return res.end();
    }

    const requestData = parseRequest(req);

    switch (requestData.type) {
      case RequestType.CheckFileInfo:
        return await handleCheckFileInfoRequest(req, res, requestData);

      case RequestType.Lock:
        return await handleLockRequest(req, res, requestData);

      case RequestType.Unlock:
        return await handleUnlockRequest(req, res, requestData);

      case RequestType.RefreshLock:
        return await handleRefreshLockRequest(req, res, requestData);

      case RequestType.UnlockAndRelock:
        return await handleUnlockAndRelockRequest(req, res, requestData);

      case RequestType.GetFile:
        return await handleGetFileRequest(req, res, requestData);

      case RequestType.PutFile:
        return await handlePutFileRequest(req, res, requestData);

      default:
        if (unsupportedTypes.has(requestData.type)) {
          returnUnsupported(res);
          return res.end();
        }

        returnServerError(res);
        return res.end();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  processWopiRequest,
  validateAccess,
  validateWopiProofKey,
  parseRequest,
};
