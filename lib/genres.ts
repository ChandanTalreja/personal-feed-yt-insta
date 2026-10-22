import { asc } from "drizzle-orm";
import type { Db } from "./db";
import { genres } from "./schema";

/** Every genre, by name: shared by `GET /api/genres` and the first-screen pages (audit B1). */
export function listGenres(db: Db) {
  return db.select().from(genres).orderBy(asc(genres.name));
}
