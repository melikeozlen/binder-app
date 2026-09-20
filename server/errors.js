class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (code, message) => new HttpError(400, code, message);
const unauthorized = () => new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
const notFound = (code = 'NOT_FOUND') => new HttpError(404, code, 'Not found');

// async route handler'ları sarmalar; hataları error handler'a iletir
const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // body-parser hataları
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
  }

  console.error('[server] unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

module.exports = { HttpError, badRequest, unauthorized, notFound, wrap, errorHandler };
