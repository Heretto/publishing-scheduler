import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorHandler } from '../../src/middleware/error-handler';

vi.mock('../../src/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('errorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  it('should handle ZodError and return 400', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ]);

    mockReq.body = { name: 123 };

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Validation error',
      details: zodError.errors,
    });
  });

  it('should sanitize password from request body in logs', () => {
    const { logger } = require('../../src/logger');
    const zodError = new ZodError([]);

    mockReq.body = {
      username: 'admin',
      password: 'secret123',
      email: 'admin@example.com',
    };

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        body: expect.objectContaining({
          username: 'admin',
          password: '[REDACTED]',
          email: 'admin@example.com',
        }),
      }),
    );
  });

  it('should sanitize token fields from request body', () => {
    const { logger } = require('../../src/logger');
    const zodError = new ZodError([]);

    mockReq.body = {
      apiKey: 'key123',
      accessToken: 'token456',
      data: 'public',
    };

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        body: expect.objectContaining({
          apiKey: '[REDACTED]',
          accessToken: '[REDACTED]',
          data: 'public',
        }),
      }),
    );
  });

  it('should sanitize nested sensitive fields', () => {
    const { logger } = require('../../src/logger');
    const zodError = new ZodError([]);

    mockReq.body = {
      user: {
        username: 'admin',
        password: 'secret',
      },
      credentials: {
        apiKey: 'key123',
      },
    };

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        body: expect.objectContaining({
          user: expect.objectContaining({
            username: 'admin',
            password: '[REDACTED]',
          }),
          credentials: expect.objectContaining({
            apiKey: '[REDACTED]',
          }),
        }),
      }),
    );
  });

  it('should handle generic errors and return 500', () => {
    const genericError = new Error('Something went wrong');

    process.env.NODE_ENV = 'production';
    errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      message: undefined, // In production, don't expose error message
    });
  });

  it('should include error message in development mode', () => {
    const genericError = new Error('Something went wrong');

    process.env.NODE_ENV = 'development';
    errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      message: 'Something went wrong',
    });
  });

  it('should handle errors with array values in body', () => {
    const { logger } = require('../../src/logger');
    const zodError = new ZodError([]);

    mockReq.body = {
      items: [
        { name: 'item1', secret: 'value1' },
        { name: 'item2', secret: 'value2' },
      ],
    };

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(logger.error).toHaveBeenCalledWith(
      'Zod validation error',
      expect.objectContaining({
        body: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              name: 'item1',
              secret: '[REDACTED]',
            }),
            expect.objectContaining({
              name: 'item2',
              secret: '[REDACTED]',
            }),
          ]),
        }),
      }),
    );
  });
});
