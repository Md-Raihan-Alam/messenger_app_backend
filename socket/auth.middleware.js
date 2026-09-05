import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Extracts a single cookie's value from a raw "Cookie" header string,
// e.g. "token=abc123; other=xyz" -> "abc123" for name="token".
// Avoids pulling in the full `cookie` package just for this one lookup.
const extractCookieValue = (rawCookieHeader, name) => {
  const cookies = rawCookieHeader.split(";").map((c) => c.trim());

  for (const c of cookies) {
    const [key, ...rest] = c.split("=");
    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
};

export const socketAuthMiddleware = (socket, next) => {
  try {
    const rawCookieHeader = socket.handshake.headers.cookie;

    if (!rawCookieHeader) {
      return next(new Error("Unauthorized: No cookie provided"));
    }

    const token = extractCookieValue(rawCookieHeader, "token");

    if (!token) {
      return next(new Error("Unauthorized: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.userId = decoded.userId;

    next();
  } catch (e) {
    next(new Error("Unauthorized: Invalid or expired token"));
  }
};
