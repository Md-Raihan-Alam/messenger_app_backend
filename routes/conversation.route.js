import { Router } from "express";
import {
  createConversation,
  getUserConversations,
  addMember,
  removeMember,
  leaveGroup,
  renameGroup,
  promoteToAdmin,
} from "../service/conversation.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

conversationRouter.post("/", createConversation);
conversationRouter.get("/", getUserConversations);

conversationRouter.post("/:conversationId/members", addMember);
conversationRouter.delete("/:conversationId/members/:userId", removeMember);
conversationRouter.post("/:conversationId/leave", leaveGroup);
conversationRouter.patch("/:conversationId/rename", renameGroup);
conversationRouter.patch(
  "/:conversationId/members/:userId/promote",
  promoteToAdmin
);
