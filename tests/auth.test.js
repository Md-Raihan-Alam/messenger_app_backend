import request from "supertest";
import app from "../app.js";
import { pool } from "../db/db.js";

describe("Auth Routes", () => {
  // Force the DB connection to establish BEFORE any timed test runs.
  // On providers like Neon, the first connection can be slow (cold start),
  // which was blowing past our 10s test timeout on the first real test.
  beforeAll(async () => {
    await pool.query("SELECT 1");
  }, 30000);

  test("Should register a user", async () => {
    const username = `user_${Date.now()}`;

    const response = await request(app).post("/api/v1/auth/register").send({
      username,
      password: "123456",
    });

    expect(response.statusCode).toBe(201);

    expect(response.body.message).toBe("User registered successfully");
  }, 10000);

  test("Should login user", async () => {
    const username = `login_${Date.now()}`;

    // register first
    await request(app).post("/api/v1/auth/register").send({
      username,
      password: "123456",
    });

    // login
    const response = await request(app).post("/api/v1/auth/login").send({
      username,
      password: "123456",
    });

    expect(response.statusCode).toBe(200);

    expect(response.body.message).toBe("User logged in successfully");
  }, 10000);

  test("Should logout user", async () => {
    const response = await request(app).get("/api/v1/auth/logout");

    expect(response.statusCode).toBe(200);

    expect(response.body.message).toBe("User logged out successfully");
  });

  test("Should reject /me with no token", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.statusCode).toBe(401);

    expect(response.body.message).toBe("Unauthorized: No token provided");
  });

  test("Should return current user with valid token", async () => {
    const username = `me_${Date.now()}`;

    // register
    await request(app).post("/api/v1/auth/register").send({
      username,
      password: "123456",
    });

    // login to get the cookie
    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      username,
      password: "123456",
    });

    const cookies = loginResponse.headers["set-cookie"];

    // hit /me with the cookie attached
    const meResponse = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookies);

    expect(meResponse.statusCode).toBe(200);

    expect(meResponse.body.user.username).toBe(username);

    expect(meResponse.body.user.password).toBeUndefined();
  }, 10000);
});

afterAll(async () => {
  await pool.end();
});
