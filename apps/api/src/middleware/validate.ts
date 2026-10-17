import { FastifyReply, FastifyRequest } from 'fastify';
import mongoose from 'mongoose';

/**
 * Validates that a route param (default 'id') is a valid MongoDB ObjectId.
 * Prevents Mongoose CastError from escalating to 500 internal errors.
 */
export function validateObjectIdParam(paramName = 'id') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as Record<string, string>;
    const idValue = params[paramName];

    if (!idValue || !mongoose.Types.ObjectId.isValid(idValue)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `The provided '${paramName}' parameter is not a valid identifier`,
        },
      });
    }
  };
}

/**
 * Validates that a route param is a valid YYYY-MM-DD date string.
 */
export function validateDateParam(paramName = 'date') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as Record<string, string>;
    const dateValue = params[paramName];

    if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || isNaN(Date.parse(dateValue))) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: `The provided '${paramName}' must be a valid date in YYYY-MM-DD format`,
        },
      });
    }
  };
}
