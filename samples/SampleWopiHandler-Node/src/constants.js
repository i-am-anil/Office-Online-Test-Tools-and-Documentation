'use strict';

const path = require('path');

const RequestType = Object.freeze({
  None: 'None',
  CheckFileInfo: 'CheckFileInfo',
  PutRelativeFile: 'PutRelativeFile',
  Lock: 'Lock',
  Unlock: 'Unlock',
  RefreshLock: 'RefreshLock',
  UnlockAndRelock: 'UnlockAndRelock',
  ExecuteCobaltRequest: 'ExecuteCobaltRequest',
  DeleteFile: 'DeleteFile',
  ReadSecureStore: 'ReadSecureStore',
  GetRestrictedLink: 'GetRestrictedLink',
  RevokeRestrictedLink: 'RevokeRestrictedLink',
  CheckFolderInfo: 'CheckFolderInfo',
  GetFile: 'GetFile',
  PutFile: 'PutFile',
  EnumerateChildren: 'EnumerateChildren',
});

const WopiHeaders = Object.freeze({
  RequestType: 'x-wopi-override',
  ItemVersion: 'x-wopi-itemversion',
  Lock: 'x-wopi-lock',
  OldLock: 'x-wopi-oldlock',
  LockFailureReason: 'x-wopi-lockfailurereason',
  LockedByOtherInterface: 'x-wopi-lockedbyotherinterface',
  SuggestedTarget: 'x-wopi-suggestedtarget',
  RelativeTarget: 'x-wopi-relativetarget',
  OverwriteRelativeTarget: 'x-wopi-overwriterelativetarget',
});

const WOPI_PATH = '/wopi/';
const FILES_REQUEST_PATH = 'files/';
const FOLDERS_REQUEST_PATH = 'folders/';
const CONTENTS_REQUEST_PATH = '/contents';
const CHILDREN_REQUEST_PATH = '/children';

const LOCAL_STORAGE_PATH =
  process.env.WOPI_STORAGE_PATH ||
  path.join(__dirname, '..', 'wopi-storage');

const LOCK_TTL_MINUTES = 30;

module.exports = {
  RequestType,
  WopiHeaders,
  WOPI_PATH,
  FILES_REQUEST_PATH,
  FOLDERS_REQUEST_PATH,
  CONTENTS_REQUEST_PATH,
  CHILDREN_REQUEST_PATH,
  LOCAL_STORAGE_PATH,
  LOCK_TTL_MINUTES,
};
