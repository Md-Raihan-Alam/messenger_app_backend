import { Router } from "express";
import {
  sendMessage,
  getConversationMessages,
  markMessageSeen,
} from "../service/message.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const messageRouter = Router();

// every message route requires a logged-in user
messageRouter.use(requireAuth);

messageRouter.post("/", sendMessage);
messageRouter.get("/:conversationId", getConversationMessages);
messageRouter.patch("/:messageId/seen", markMessageSeen);
