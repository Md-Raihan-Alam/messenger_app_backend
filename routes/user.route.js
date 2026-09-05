import { Router } from "express";
import { getAllUsers } from "../service/user.service.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get("/", getAllUsers);
