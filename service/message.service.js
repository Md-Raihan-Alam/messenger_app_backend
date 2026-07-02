import { db } from "../db/db.js";
import {
  messages,
  conversationMembers,
  messageSeen,
} from "../schemas/schema.js";
import { eq, and } from "drizzle-orm";

// Helper: confirms the requesting user is actually a member of the
// conversation before letting them read or write to it.
const isConversationMember = async (conversationId, userId) => {
  const membership = await db.query.conversationMembers.findFirst({
    where: (cm, { eq: eqOp, and: andOp }) =>
      andOp(eqOp(cm.conversationId, conversationId), eqOp(cm.userId, userId)),
  });

  return !!membership;
};

// Sends a message into a conversation.
// This is called by the REST endpoint now, and will later also be
// called from the Socket.IO "sendMessage" event handler — same
// underlying DB write, two different entry points (HTTP vs socket).
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

// Fetches message history for a conversation, oldest to newest.
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

// Marks a single message as seen by the authenticated user.
// Uses an upsert-like pattern: only insert if this user hasn't
// already marked this message as seen (avoids duplicate rows).
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

    await db.insert(messageSeen).values({
      messageId: Number(messageId),
      userId,
    });

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
