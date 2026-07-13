import type express from "express";

import { resolveCurrentUser, type CurrentUser } from "./session.js";

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}

export async function requireAuth(request: express.Request, response: express.Response, next: express.NextFunction) {
  try {
    const currentUser = await resolveCurrentUser(request);

    if (!currentUser) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    request.currentUser = currentUser;
    next();
  } catch (error) {
    next(error);
  }
}
