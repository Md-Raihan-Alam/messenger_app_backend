import request from "supertest";
import app from "../app.js";
import { pool } from "../db/db.js";

// Helper: registers + logs in a user, returns their auth cookie and id
const registerAndLogin = async (username) => {
  await request(app).post("/api/v1/auth/register").send({
    username,
    password: "123456",
  });

  const loginResponse = await request(app).post("/api/v1/auth/login").send({
    username,
    password: "123456",
  });

  const cookies = loginResponse.headers["set-cookie"];

  const meResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Cookie", cookies);

  return { cookies, userId: meResponse.body.user.id };
};

describe("Conversation Routes", () => {
  beforeAll(async () => {
    await pool.query("SELECT 1");
  }, 30000);

  test("Should reject creating a conversation with no auth", async () => {
    const response = await request(app)
      .post("/api/v1/conversations")
      .send({
        participantIds: [1],
        isGroup: false,
      });

    expect(response.statusCode).toBe(401);
  });

  test("Should create an individual conversation", async () => {
    const userA = await registerAndLogin(`convA_${Date.now()}`);
    const userB = await registerAndLogin(`convB_${Date.now()}`);

    const response = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: false,
      });

    expect(response.statusCode).toBe(201);

    expect(response.body.conversation.isGroup).toBe(false);
  }, 15000);

  test("Should not create a duplicate individual conversation", async () => {
    const userA = await registerAndLogin(`convC_${Date.now()}`);
    const userB = await registerAndLogin(`convD_${Date.now()}`);

    // first conversation
    const first = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: false,
      });

    // attempt duplicate
    const second = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: false,
      });

    expect(second.statusCode).toBe(200);

    expect(second.body.message).toBe("Conversation already exists");

    expect(second.body.conversation.id).toBe(first.body.conversation.id);
  }, 15000);

  test("Should create a group conversation", async () => {
    const userA = await registerAndLogin(`convE_${Date.now()}`);
    const userB = await registerAndLogin(`convF_${Date.now()}`);
    const userC = await registerAndLogin(`convG_${Date.now()}`);

    const response = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId, userC.userId],
        isGroup: true,
        name: "Test Group",
      });

    expect(response.statusCode).toBe(201);

    expect(response.body.conversation.isGroup).toBe(true);

    expect(response.body.conversation.name).toBe("Test Group");
  }, 15000);

  test("Should reject a group conversation with no name", async () => {
    const userA = await registerAndLogin(`convH_${Date.now()}`);
    const userB = await registerAndLogin(`convI_${Date.now()}`);

    const response = await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: true,
      });

    expect(response.statusCode).toBe(400);
  }, 15000);

  test("Should list the authenticated user's conversations", async () => {
    const userA = await registerAndLogin(`convJ_${Date.now()}`);
    const userB = await registerAndLogin(`convK_${Date.now()}`);

    await request(app)
      .post("/api/v1/conversations")
      .set("Cookie", userA.cookies)
      .send({
        participantIds: [userB.userId],
        isGroup: false,
      });

    const response = await request(app)
      .get("/api/v1/conversations")
      .set("Cookie", userA.cookies);

    expect(response.statusCode).toBe(200);

    expect(Array.isArray(response.body.conversations)).toBe(true);

    expect(response.body.conversations.length).toBeGreaterThan(0);
  }, 15000);
});

afterAll(async () => {
  await pool.end();
});
