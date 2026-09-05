import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import * as cookie from "cookie";

dotenv.config();

export const socketAuthMiddleware = (socket, next) => {
  try {
    const rawCookieHeader = socket.handshake.headers.cookie;

    console.log("DEBUG raw cookie header:", rawCookieHeader);

    if (!rawCookieHeader) {
      return next(new Error("Unauthorized: No cookie provided"));
    }

    const parsedCookies = cookie.parse(rawCookieHeader);

    console.log("DEBUG parsed cookies:", parsedCookies);

    const token = parsedCookies.token;

    console.log("DEBUG extracted token:", token);

    if (!token) {
      return next(new Error("Unauthorized: No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.userId = decoded.userId;

    next();
  } catch (e) {
    console.log("DEBUG jwt verify failed:", e.message);
    next(new Error("Unauthorized: Invalid or expired token"));
  }
};
