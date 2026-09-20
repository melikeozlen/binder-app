const express = require('express');
const { wrap } = require('../errors');

// Mevcut Vercel tarzı handler'lar (api/) Express'te de aynı imzayla çalışır.
const driveGalleryHandler = require('../../api/drive-gallery');
const driveImageHandler = require('../../api/drive-image');
const imageProxyHandler = require('../../api/image-proxy');

function createDriveRouter() {
  const router = express.Router();
  router.all('/drive-gallery', express.json({ limit: '16kb' }), wrap(driveGalleryHandler));
  router.get('/drive-image', wrap(driveImageHandler));
  router.get('/image-proxy', wrap(imageProxyHandler));
  return router;
}

module.exports = { createDriveRouter };
