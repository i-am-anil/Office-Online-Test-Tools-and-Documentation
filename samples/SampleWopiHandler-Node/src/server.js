'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { LOCAL_STORAGE_PATH } = require('./constants');
const { processWopiRequest } = require('./wopiHandler');

const PORT = Number(process.env.PORT) || 3000;

const app = express();

fs.mkdirSync(LOCAL_STORAGE_PATH, { recursive: true });

app.use('/wopi', (req, _res, next) => {
  if (req.method === 'POST' && req.path.endsWith('/contents')) {
    return next();
  }
  return express.json()(req, _res, next);
});

app.all(/^\/wopi(\/.*)?$/, processWopiRequest);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('Server Error');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sample WOPI handler listening on http://localhost:${PORT}`);
    console.log(`Storage path: ${path.resolve(LOCAL_STORAGE_PATH)}`);
  });
}

module.exports = app;
