import mongoose from 'mongoose';
import env from '../config/env.js';
import ApiError from '../lib/ApiError.js';

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  let error = err;

  // Translate storage-layer failures into the public error vocabulary so no
  // driver internals ever reach a client.
  if (err instanceof mongoose.Error.ValidationError) {
    error = ApiError.badRequest(
      'Please correct the highlighted fields',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    error = ApiError.conflict(`That ${field} is already in use`);
  } else if (!err?.isApiError) {
    error = ApiError.server();
  }

  if (error.status >= 500) {
    console.error('[api]', err?.stack || err);
  }

  const body = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };

  // Stack traces are for the server log, never the response (CLAUDE.md s.14).
  if (!env.isProd && err?.stack) body.error.stack = err.stack;

  res.status(error.status || 500).json(body);
}
