import { Router } from "express";
import {
  createConversation,
  getUserConversations,
} from "../service/conversation.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const conversationRouter = Router();

// every conversation route requires a logged-in user
conversationRouter.use(requireAuth);

conversationRouter.post("/", createConversation);
conversationRouter.get("/", getUserConversations);
