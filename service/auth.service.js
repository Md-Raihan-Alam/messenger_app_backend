import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db/db.js";
import { users } from "../schemas/schema.js";
import dotenv from "dotenv";

dotenv.config();

export const registerUser = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.username, username),
    });
    if (user) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, process.env.SALT_ROUNDS);

    await db.insert(users).values({
      username,
      password: hashedPassword,
    });
    res.status(201).json({ message: "User registered successfully" });
  } catch (e) {
    console.log(e);
  }
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.username, username),
    });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.EXPIRES_IN, {
      expiresIn: process.env.EXPIRES_IN,
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
    res.status(200).json({ message: "User logged in successfully" });
  } catch (e) {
    console.log(e);
  }
};

export const logoutUser = (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "User logged out successfully" });
};
