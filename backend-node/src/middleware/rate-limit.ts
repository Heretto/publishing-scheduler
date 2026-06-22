import rateLimit from 'express-rate-limit';
import { config } from '../config';

// General API rate limiter - 100 requests per 15 minutes per IP
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === 'production' ? 100 : 1000, // More lenient in development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for job triggering - 10 requests per minute
export const jobTriggerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.nodeEnv === 'production' ? 10 : 100,
  message: 'Too many job triggers, please wait before triggering more jobs.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limiter for create/update operations - 30 per 5 minutes
export const mutationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: config.nodeEnv === 'production' ? 30 : 200,
  message: 'Too many changes, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});
