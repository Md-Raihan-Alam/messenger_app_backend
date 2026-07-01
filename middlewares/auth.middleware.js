import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const requireAuth = (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized: No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // attach userId to the request so downstream routes/controllers can use it
    req.userId = decoded.userId;

    next();
  } catch (e) {
    // covers expired tokens, tampered tokens, wrong secret, etc.
    return res.status(401).json({
      message: "Unauthorized: Invalid or expired token",
    });
  }
};
