'use strict';

const path = require('path');
const {
  RequestType,
  WopiHeaders,
  WOPI_PATH,
  FILES_REQUEST_PATH,
  FOLDERS_REQUEST_PATH,
  CONTENTS_REQUEST_PATH,
  CHILDREN_REQUEST_PATH,
  LOCAL_STORAGE_PATH,
} = require('./constants');

/**
 * @typedef {object} WopiRequest
 * @property {string} type
 * @property {string} accessToken
 * @property {string} id
 * @property {string} fullPath
 */

/**
 * Parse the request to determine type, access token, and file id.
 * @param {import('express').Request} req
 * @returns {WopiRequest}
 */
function parseRequest(req) {
  const requestData = {
    type: RequestType.None,
    accessToken: req.query.access_token || '',
    id: '',
    fullPath: '',
  };

  // Use originalUrl so routing works whether the handler is mounted at /wopi or not.
  const requestPath = req.originalUrl.split('?')[0];
  if (!requestPath.startsWith(WOPI_PATH)) {
    return requestData;
  }

  const wopiPath = requestPath.substring(WOPI_PATH.length);

  if (wopiPath.startsWith(FILES_REQUEST_PATH)) {
    const rawId = wopiPath.substring(FILES_REQUEST_PATH.length);

    if (rawId.endsWith(CONTENTS_REQUEST_PATH)) {
      requestData.id = rawId.substring(
        0,
        rawId.length - CONTENTS_REQUEST_PATH.length
      );

      if (req.method === 'GET') {
        requestData.type = RequestType.GetFile;
      } else if (req.method === 'POST') {
        requestData.type = RequestType.PutFile;
      }
    } else {
      requestData.id = rawId;

      if (req.method === 'GET') {
        requestData.type = RequestType.CheckFileInfo;
      } else if (req.method === 'POST') {
        const wopiOverride = req.get(WopiHeaders.RequestType);

        switch (wopiOverride) {
          case 'PUT_RELATIVE':
            requestData.type = RequestType.PutRelativeFile;
            break;
          case 'LOCK':
            requestData.type = req.get(WopiHeaders.OldLock)
              ? RequestType.UnlockAndRelock
              : RequestType.Lock;
            break;
          case 'UNLOCK':
            requestData.type = RequestType.Unlock;
            break;
          case 'REFRESH_LOCK':
            requestData.type = RequestType.RefreshLock;
            break;
          case 'COBALT':
            requestData.type = RequestType.ExecuteCobaltRequest;
            break;
          case 'DELETE':
            requestData.type = RequestType.DeleteFile;
            break;
          case 'READ_SECURE_STORE':
            requestData.type = RequestType.ReadSecureStore;
            break;
          case 'GET_RESTRICTED_LINK':
            requestData.type = RequestType.GetRestrictedLink;
            break;
          case 'REVOKE_RESTRICTED_LINK':
            requestData.type = RequestType.RevokeRestrictedLink;
            break;
          default:
            break;
        }
      }
    }
  } else if (wopiPath.startsWith(FOLDERS_REQUEST_PATH)) {
    const rawId = wopiPath.substring(FOLDERS_REQUEST_PATH.length);

    if (rawId.endsWith(CHILDREN_REQUEST_PATH)) {
      requestData.id = rawId.substring(
        0,
        rawId.length - CHILDREN_REQUEST_PATH.length
      );
      requestData.type = RequestType.EnumerateChildren;
    } else {
      requestData.id = rawId;
      requestData.type = RequestType.CheckFolderInfo;
    }
  }

  requestData.fullPath = path.join(LOCAL_STORAGE_PATH, requestData.id);
  return requestData;
}

module.exports = { parseRequest };
