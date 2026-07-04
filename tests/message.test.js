import request from "supertest";
import app from "../app.js";
import { pool } from "../db/db.js";

// Helper: registers + logs in a user, returns their auth cookie, id, and username
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

  return { cookies, userId: meResponse.body.user.id, username };
};

// Helper: creates an individual conversation between two users, returns its id
const createConversation = async (userA, userB) => {
  const response = await request(app)
    .post("/api/v1/conversations")
    .set("Cookie", userA.cookies)
    .send({
      participantIds: [userB.userId],
      isGroup: false,
    });

  return response.body.conversation.id;
};

describe("Message Routes", () => {
  beforeAll(async () => {
    await pool.query("SELECT 1");
  }, 30000);

  test("Should reject sending a message with no auth", async () => {
    const response = await request(app).post("/api/v1/messages").send({
      conversationId: 1,
      content: "hello",
    });

    expect(response.statusCode).toBe(401);
  });

  test("Should send a message in a conversation", async () => {
    const userA = await registerAndLogin(`msgA_${Date.now()}`);
    const userB = await registerAndLogin(`msgB_${Date.now()}`);
    const conversationId = await createConversation(userA, userB);

    const response = await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userA.cookies)
      .send({
        conversationId,
        content: "Hey there!",
      });

    expect(response.statusCode).toBe(201);

    expect(response.body.data.content).toBe("Hey there!");
  }, 15000);

  test("Should reject sending a message to a conversation you're not a member of", async () => {
    const userA = await registerAndLogin(`msgC_${Date.now()}`);
    const userB = await registerAndLogin(`msgD_${Date.now()}`);
    const outsider = await registerAndLogin(`msgE_${Date.now()}`);

    const conversationId = await createConversation(userA, userB);

    const response = await request(app)
      .post("/api/v1/messages")
      .set("Cookie", outsider.cookies)
      .send({
        conversationId,
        content: "I shouldn't be able to send this",
      });

    expect(response.statusCode).toBe(403);
  }, 15000);

  test("Should fetch conversation message history with sender info", async () => {
    const userA = await registerAndLogin(`msgF_${Date.now()}`);
    const userB = await registerAndLogin(`msgG_${Date.now()}`);
    const conversationId = await createConversation(userA, userB);

    await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userA.cookies)
      .send({
        conversationId,
        content: "First message",
      });

    await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userB.cookies)
      .send({
        conversationId,
        content: "Second message",
      });

    const response = await request(app)
      .get(`/api/v1/messages/${conversationId}`)
      .set("Cookie", userA.cookies);

    expect(response.statusCode).toBe(200);

    expect(response.body.messages.length).toBe(2);

    expect(response.body.messages[0].content).toBe("First message");

    expect(response.body.messages[0].sender.username).toBe(userA.username);
  }, 15000);

  test("Should mark a message as seen", async () => {
    const userA = await registerAndLogin(`msgH_${Date.now()}`);
    const userB = await registerAndLogin(`msgI_${Date.now()}`);
    const conversationId = await createConversation(userA, userB);

    const sendResponse = await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userA.cookies)
      .send({
        conversationId,
        content: "Seen test message",
      });

    const messageId = sendResponse.body.data.id;

    const seenResponse = await request(app)
      .patch(`/api/v1/messages/${messageId}/seen`)
      .set("Cookie", userB.cookies);

    expect(seenResponse.statusCode).toBe(201);

    expect(seenResponse.body.message).toBe("Message marked as seen");
  }, 15000);

  test("Should not duplicate seen records on repeated calls", async () => {
    const userA = await registerAndLogin(`msgJ_${Date.now()}`);
    const userB = await registerAndLogin(`msgK_${Date.now()}`);
    const conversationId = await createConversation(userA, userB);

    const sendResponse = await request(app)
      .post("/api/v1/messages")
      .set("Cookie", userA.cookies)
      .send({
        conversationId,
        content: "Duplicate seen test",
      });

    const messageId = sendResponse.body.data.id;

    await request(app)
      .patch(`/api/v1/messages/${messageId}/seen`)
      .set("Cookie", userB.cookies);

    const secondCall = await request(app)
      .patch(`/api/v1/messages/${messageId}/seen`)
      .set("Cookie", userB.cookies);

    expect(secondCall.statusCode).toBe(200);

    expect(secondCall.body.message).toBe("Message already marked as seen");
  }, 15000);
});

afterAll(async () => {
  await pool.end();
});
