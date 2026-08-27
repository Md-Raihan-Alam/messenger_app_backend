import { db } from "../db/db.js";
import { conversations, conversationMembers } from "../schemas/schema.js";
import { eq, and } from "drizzle-orm";
import { joinUserToRoom } from "../socket/index.js";

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

// Helper: fetches a member row for a specific user in a specific
// conversation, or null if they're not a member at all.
const getMembership = async (conversationId, userId) => {
  return db.query.conversationMembers.findFirst({
    where: (cm, { eq: eqOp, and: andOp }) =>
      andOp(eqOp(cm.conversationId, conversationId), eqOp(cm.userId, userId)),
  });
};

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

// ─────────────────────────────────────────────
// GROUP MANAGEMENT
// Simple, direct implementations — each function checks the requester's
// role/membership, does one DB operation, and returns. No socket
// broadcasts for these yet (kept out on purpose to stay simple, per
// scope) — the group's members will see changes next time they fetch
// their conversation list or membership data via REST.
// ─────────────────────────────────────────────

// Adds a new member to a group conversation. Only an existing admin
// can add members.
export const addMember = async (req, res) => {
  try {
    const requesterId = req.userId;
    const { conversationId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, Number(conversationId)),
    });

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const requesterMembership = await getMembership(
      Number(conversationId),
      requesterId
    );

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return res.status(403).json({ message: "Only an admin can add members" });
    }

    const alreadyMember = await getMembership(Number(conversationId), userId);

    if (alreadyMember) {
      return res.status(400).json({ message: "User is already a member" });
    }

    await db.insert(conversationMembers).values({
      conversationId: Number(conversationId),
      userId,
      role: "member",
    });

    // If the new member is currently connected, join their socket(s)
    // to this room live — same pattern as conversation creation.
    try {
      joinUserToRoom(userId, `conversation:${conversationId}`);
    } catch (e) {
      console.error("Failed to live-join new member:", e);
    }

    return res.status(201).json({ message: "Member added successfully" });
  } catch (e) {
    console.error("ADD MEMBER ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Removes a member from a group conversation. Only an admin can remove
// someone else. (Removing yourself is the separate leaveGroup endpoint.)
export const removeMember = async (req, res) => {
  try {
    const requesterId = req.userId;
    const { conversationId, userId } = req.params;

    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, Number(conversationId)),
    });

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const requesterMembership = await getMembership(
      Number(conversationId),
      requesterId
    );

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only an admin can remove members" });
    }

    const targetMembership = await getMembership(
      Number(conversationId),
      Number(userId)
    );

    if (!targetMembership) {
      return res
        .status(404)
        .json({ message: "User is not a member of this group" });
    }

    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, Number(conversationId)),
          eq(conversationMembers.userId, Number(userId))
        )
      );

    return res.status(200).json({ message: "Member removed successfully" });
  } catch (e) {
    console.error("REMOVE MEMBER ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Lets the authenticated user remove themselves from a group.
export const leaveGroup = async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;

    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, Number(conversationId)),
    });

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const membership = await getMembership(Number(conversationId), userId);

    if (!membership) {
      return res
        .status(400)
        .json({ message: "You are not a member of this group" });
    }

    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, Number(conversationId)),
          eq(conversationMembers.userId, userId)
        )
      );

    return res.status(200).json({ message: "Left group successfully" });
  } catch (e) {
    console.error("LEAVE GROUP ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Renames a group conversation. Admin only.
export const renameGroup = async (req, res) => {
  try {
    const requesterId = req.userId;
    const { conversationId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, Number(conversationId)),
    });

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const requesterMembership = await getMembership(
      Number(conversationId),
      requesterId
    );

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only an admin can rename the group" });
    }

    await db
      .update(conversations)
      .set({ name })
      .where(eq(conversations.id, Number(conversationId)));

    return res.status(200).json({ message: "Group renamed successfully" });
  } catch (e) {
    console.error("RENAME GROUP ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Promotes an existing member to admin. Admin only.
export const promoteToAdmin = async (req, res) => {
  try {
    const requesterId = req.userId;
    const { conversationId, userId } = req.params;

    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: eqOp }) => eqOp(c.id, Number(conversationId)),
    });

    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const requesterMembership = await getMembership(
      Number(conversationId),
      requesterId
    );

    if (!requesterMembership || requesterMembership.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only an admin can promote members" });
    }

    const targetMembership = await getMembership(
      Number(conversationId),
      Number(userId)
    );

    if (!targetMembership) {
      return res
        .status(404)
        .json({ message: "User is not a member of this group" });
    }

    await db
      .update(conversationMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(conversationMembers.conversationId, Number(conversationId)),
          eq(conversationMembers.userId, Number(userId))
        )
      );

    return res.status(200).json({ message: "Member promoted to admin" });
  } catch (e) {
    console.error("PROMOTE TO ADMIN ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};
