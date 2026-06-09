'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('fs/promises');
const path = require('path');
const request = require('supertest');
const { clearLocks } = require('../src/locks');

const TEST_STORAGE = path.join(__dirname, 'tmp-wopi-storage');
process.env.WOPI_STORAGE_PATH = TEST_STORAGE;

// Reload modules after env is set.
delete require.cache[require.resolve('../src/constants')];
delete require.cache[require.resolve('../src/wopiRequest')];
delete require.cache[require.resolve('../src/wopiHandler')];
delete require.cache[require.resolve('../src/server')];

const app = require('../src/server');
const { WopiHeaders } = require('../src/constants');

const FILE_ID = 'sample.txt';
const FILE_PATH = path.join(TEST_STORAGE, FILE_ID);

describe('WopiHandler', () => {
  before(async () => {
    await fsp.mkdir(TEST_STORAGE, { recursive: true });
    await fsp.writeFile(FILE_PATH, 'hello wopi', 'utf8');
    clearLocks();
  });

  after(async () => {
    clearLocks();
    await fsp.rm(TEST_STORAGE, { recursive: true, force: true });
  });

  it('returns 401 for missing access token', async () => {
    const res = await request(app).get(`/wopi/files/${FILE_ID}`);
    assert.equal(res.status, 401);
  });

  it('returns 401 for INVALID access token', async () => {
    const res = await request(app)
      .get(`/wopi/files/${FILE_ID}`)
      .query({ access_token: 'INVALID' });
    assert.equal(res.status, 401);
  });

  it('returns 404 for unknown files', async () => {
    const res = await request(app)
      .get('/wopi/files/does-not-exist')
      .query({ access_token: 'valid' });
    assert.equal(res.status, 404);
  });

  it('handles CheckFileInfo', async () => {
    const res = await request(app)
      .get(`/wopi/files/${FILE_ID}`)
      .query({ access_token: 'valid' });

    assert.equal(res.status, 200);
    assert.equal(res.body.BaseFileName, FILE_ID);
    assert.equal(res.body.SupportsLocks, true);
    assert.equal(res.body.UserCanNotWriteRelative, true);
    assert.equal(res.body.Size, Buffer.byteLength('hello wopi'));
  });

  it('handles GetFile', async () => {
    const res = await request(app)
      .get(`/wopi/files/${FILE_ID}/contents`)
      .query({ access_token: 'valid' });

    assert.equal(res.status, 200);
    assert.equal(res.text, 'hello wopi');
    assert.ok(res.headers[WopiHeaders.ItemVersion]);
  });

  it('handles Lock and Unlock', async () => {
    const lock = 'lock-string-abc';

    const lockRes = await request(app)
      .post(`/wopi/files/${FILE_ID}`)
      .query({ access_token: 'valid' })
      .set(WopiHeaders.RequestType, 'LOCK')
      .set(WopiHeaders.Lock, lock);

    assert.equal(lockRes.status, 200);
    assert.ok(lockRes.headers[WopiHeaders.ItemVersion]);

    const unlockRes = await request(app)
      .post(`/wopi/files/${FILE_ID}`)
      .query({ access_token: 'valid' })
      .set(WopiHeaders.RequestType, 'UNLOCK')
      .set(WopiHeaders.Lock, lock);

    assert.equal(unlockRes.status, 200);
  });

  it('handles PutFile on a zero-byte file without a lock', async () => {
    const emptyId = 'empty.txt';
    const emptyPath = path.join(TEST_STORAGE, emptyId);
    await fsp.writeFile(emptyPath, '', 'utf8');

    const res = await request(app)
      .post(`/wopi/files/${emptyId}/contents`)
      .query({ access_token: 'valid' })
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('new content'));

    assert.equal(res.status, 200);
    assert.equal(await fsp.readFile(emptyPath, 'utf8'), 'new content');
  });

  it('returns 409 for PutFile on unlocked non-empty file', async () => {
    const res = await request(app)
      .post(`/wopi/files/${FILE_ID}/contents`)
      .query({ access_token: 'valid' })
      .set(WopiHeaders.Lock, 'some-lock')
      .send(Buffer.from('blocked'));

    assert.equal(res.status, 409);
  });

  it('returns 501 for unsupported operations', async () => {
    const res = await request(app)
      .post(`/wopi/files/${FILE_ID}`)
      .query({ access_token: 'valid' })
      .set(WopiHeaders.RequestType, 'DELETE');

    assert.equal(res.status, 501);
  });
});
