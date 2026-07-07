import { db } from "../db/db.js";
import { conversations, conversationMembers } from "../schemas/schema.js";
import { joinUserToRoom } from "../socket/index.js";
// Creates a new conversation.
// - Individual: exactly one other participant, no name, isGroup = false
// - Group: multiple participants, requires a name, isGroup = true
export const createConversation = async (req, res) => {
  try {
    const creatorId = req.userId;
    const { participantIds, name, isGroup } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        message: "participantIds must be a non-empty array",
      });
    }

    if (isGroup && !name) {
      return res.status(400).json({
        message: "Group conversations require a name",
      });
    }

    if (!isGroup && participantIds.length !== 1) {
      return res.status(400).json({
        message:
          "Individual conversations require exactly one other participant",
      });
    }

    // For individual chats, avoid creating duplicate conversations
    // between the same two users.
    if (!isGroup) {
      const existing = await findExistingIndividualConversation(
        creatorId,
        participantIds[0]
      );

      if (existing) {
        return res.status(200).json({
          message: "Conversation already exists",
          conversation: existing,
        });
      }
    }

    const [conversation] = await db
      .insert(conversations)
      .values({
        name: isGroup ? name : null,
        isGroup: !!isGroup,
      })
      .returning();

    // Add the creator + all participants as members.
    // Creator is "admin" in group chats; everyone is "member" in individual chats.
    const memberRows = [
      {
        conversationId: conversation.id,
        userId: creatorId,
        role: isGroup ? "admin" : "member",
      },
      ...participantIds.map((id) => ({
        conversationId: conversation.id,
        userId: id,
        role: "member",
      })),
    ];

    await db.insert(conversationMembers).values(memberRows);
    // ─────────────────────────────────────────────
    // LIVE ROOM JOINING
    // Every member just added to this brand-new conversation might
    // already be connected via socket right now. If so, join their
    // active socket(s) to this conversation's room immediately —
    // otherwise they'd only see this conversation live after their
    // next reconnect, which is a poor real-time experience.
    //
    // This is a fire-and-forget, best-effort step: it's purely an
    // in-memory socket operation, doesn't touch the DB, and should
    // never cause conversation creation itself to fail.
    // ─────────────────────────────────────────────
    const roomName = `conversation:${conversation.id}`;
    const allMemberIds = [creatorId, ...participantIds];
    allMemberIds.forEach((userId) => {
      try {
        joinUserToRoom(userId, roomName);
      } catch (e) {
        console.error(`Failed to live-join user ${userId} to ${roomName}:`, e);
      }
    });
    return res.status(201).json({
      message: "Conversation created successfully",
      conversation,
    });
  } catch (e) {
    console.error("CREATE CONVERSATION ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Helper: finds an existing 1-on-1 (non-group) conversation between two users.
// Prevents duplicate DMs from being created every time users click "message".
const findExistingIndividualConversation = async (userAId, userBId) => {
  const userAConvos = await db.query.conversationMembers.findMany({
    where: (cm, { eq }) => eq(cm.userId, userAId),
  });

  for (const convo of userAConvos) {
    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq, and: andOp }) =>
        andOp(eq(c.id, convo.conversationId), eq(c.isGroup, false)),
    });

    if (!conversation) continue;

    const isUserBMember = await db.query.conversationMembers.findFirst({
      where: (cm, { eq, and: andOp }) =>
        andOp(eq(cm.conversationId, conversation.id), eq(cm.userId, userBId)),
    });

    if (isUserBMember) {
      return conversation;
    }
  }

  return null;
};

// Lists all conversations the authenticated user is a member of.
export const getUserConversations = async (req, res) => {
  try {
    const userId = req.userId;

    const memberships = await db.query.conversationMembers.findMany({
      where: (cm, { eq }) => eq(cm.userId, userId),
      with: {
        conversation: true,
      },
    });

    const userConversations = memberships.map((m) => m.conversation);

    return res.status(200).json({ conversations: userConversations });
  } catch (e) {
    console.error("GET CONVERSATIONS ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
