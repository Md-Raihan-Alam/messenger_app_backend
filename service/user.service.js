import { db } from "../db/db.js";
import { ne } from "drizzle-orm";
import { users } from "../schemas/schema.js";

// Lists all users except the requester — used by the frontend to let
// someone pick who to start a new conversation with. Deliberately
// minimal: no pagination, no search, no online-status filter. This is
// a small utility endpoint, not its own feature module.
export const getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.userId;

    const allUsers = await db.query.users.findMany({
      where: (u) => ne(u.id, currentUserId),
      columns: {
        id: true,
        username: true,
        isOnline: true,
        // password intentionally excluded
      },
    });

    return res.status(200).json({ users: allUsers });
  } catch (e) {
    console.error("GET ALL USERS ERROR:", e);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
