import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Socket.IO middleware — runs ONCE per socket, at connection handshake time.
// This is the socket equivalent of Express's requireAuth, but it only
// verifies once for the whole connection's lifetime, not per event.
export const socketAuthMiddleware = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized: No token provided"));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // attach userId directly to the socket — available for the
    // entire lifetime of this connection, in every event handler
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error("Unauthorized: Invalid or expired token"));
  }
};
