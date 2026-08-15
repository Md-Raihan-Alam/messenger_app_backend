import { db } from "../db/db.js";
import {
  messages,
  conversationMembers,
  messageSeen,
} from "../schemas/schema.js";
import { eq, and } from "drizzle-orm";
import { getIO } from "../socket/index.js";

const isConversationMember = async (conversationId, userId) => {
  const membership = await db.query.conversationMembers.findFirst({
    where: (cm, { eq: eqOp, and: andOp }) =>
      andOp(eqOp(cm.conversationId, conversationId), eqOp(cm.userId, userId)),
  });

  return !!membership;
};

export const sendMessage = async (req, res) => {
  try {
    const senderId = req.userId;
    const { conversationId, content } = req.body;

    if (!conversationId || !content) {
      return res.status(400).json({
        message: "conversationId and content are required",
      });
    }

    const isMember = await isConversationMember(conversationId, senderId);

    if (!isMember) {
      return res.status(403).json({
        message: "You are not a member of this conversation",
      });
    }

    const [message] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        content,
      })
      .returning();

    try {
      getIO().to(`conversation:${conversationId}`).emit("newMessage", message);
    } catch (socketError) {
      console.error("Failed to broadcast message via socket:", socketError);
    }

    return res.status(201).json({
      message: "Message sent successfully",
      data: message,
    });
  } catch (e) {
    console.error("SEND MESSAGE ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getConversationMessages = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;

    const isMember = await isConversationMember(Number(conversationId), userId);

    if (!isMember) {
      return res.status(403).json({
        message: "You are not a member of this conversation",
      });
    }

    const conversationMessages = await db.query.messages.findMany({
      where: (m, { eq: eqOp }) =>
        eqOp(m.conversationId, Number(conversationId)),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
      with: {
        sender: {
          columns: {
            id: true,
            username: true,
          },
        },
      },
    });

    return res.status(200).json({ messages: conversationMessages });
  } catch (e) {
    console.error("GET MESSAGES ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Marks a single message as seen by the authenticated user, then
// broadcasts that fact live to everyone else in the conversation —
// e.g. so the original sender sees a "seen" indicator update without
// needing to refresh or re-fetch anything.
export const markMessageSeen = async (req, res) => {
  try {
    const userId = req.userId;
    const { messageId } = req.params;

    const alreadySeen = await db.query.messageSeen.findFirst({
      where: (ms, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(ms.messageId, Number(messageId)), eqOp(ms.userId, userId)),
    });

    if (alreadySeen) {
      return res.status(200).json({
        message: "Message already marked as seen",
      });
    }

    // We need the message's conversationId to know which room to
    // broadcast into — the request only gave us a messageId.
    const message = await db.query.messages.findFirst({
      where: (m, { eq: eqOp }) => eqOp(m.id, Number(messageId)),
    });

    if (!message) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    const isMember = await isConversationMember(message.conversationId, userId);

    if (!isMember) {
      return res.status(403).json({
        message: "You are not a member of this conversation",
      });
    }

    const [seenRecord] = await db
      .insert(messageSeen)
      .values({
        messageId: Number(messageId),
        userId,
      })
      .returning();

    try {
      getIO().to(`conversation:${message.conversationId}`).emit("messageSeen", {
        messageId: seenRecord.messageId,
        userId: seenRecord.userId,
        seenAt: seenRecord.seenAt,
      });
    } catch (socketError) {
      console.error("Failed to broadcast messageSeen via socket:", socketError);
    }

    return res.status(201).json({
      message: "Message marked as seen",
    });
  } catch (e) {
    console.error("MARK SEEN ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
