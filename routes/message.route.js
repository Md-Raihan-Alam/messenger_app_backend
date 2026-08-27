import { Router } from "express";
import {
  sendMessage,
  getConversationMessages,
  markMessageSeen,
} from "../service/message.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { messageLimiter } from "../middlewares/rateLimit.middleware.js";

export const messageRouter = Router();

messageRouter.use(requireAuth);

messageRouter.post("/", messageLimiter, sendMessage);
messageRouter.get("/:conversationId", getConversationMessages);
messageRouter.patch("/:messageId/seen", markMessageSeen);
