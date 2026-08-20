import rateLimit from "express-rate-limit";

// Strict limiter for auth routes — login/register are classic brute-force
// targets, so we allow far fewer attempts here than normal API usage.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP per window
  message: {
    message: "Too many attempts. Please try again in a few minutes.",
  },
  standardHeaders: true, // adds RateLimit-* headers to the response
  legacyHeaders: false,
});

// Looser limiter for sending messages — generous enough for normal fast
// typing/chatting, but stops a client from flooding the server.
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per IP per minute
  message: {
    message: "You're sending messages too quickly. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
