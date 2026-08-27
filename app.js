import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { authRouter } from "./routes/auth.route.js";
import { conversationRouter } from "./routes/conversation.route.js";
import { messageRouter } from "./routes/message.route.js";

dotenv.config();

const app = express();

// CORS must be configured with an explicit origin (not "*") because
// we're using credentials: "include" on the frontend to send cookies
// cross-origin. Browsers reject wildcard origins when credentials
// are involved — this is a browser security rule, not an Express one.
app.use(
  cors({
    origin: "http://localhost:3000", // TODO: update for production frontend URL
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/conversations", conversationRouter);
app.use("/api/v1/messages", messageRouter);

app.get("/", (req, res) => {
  res.send("Welcome to the Messenger App Backend!");
});

export default app;
