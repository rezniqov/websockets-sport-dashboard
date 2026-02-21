import { Router } from 'express';
import { db } from '../db/db.js';
import { commentary } from '../db/schema.js';
import { matchIdParamSchema } from '../validation/matches.js';
import { createCommentarySchema, listCommentaryQuerySchema } from '../validation/commentary.js';
import { desc, eq } from 'drizzle-orm';

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get('/', async (req, res) => {
  const parsedParams = matchIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ error: 'Invalid params', details: parsedParams.error.issues });
  }

  const parsedQuery = listCommentaryQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsedQuery.error.issues });
  }

  const { id: matchId } = parsedParams.data;
  const limit = Math.min(parsedQuery.data.limit ?? MAX_LIMIT, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(limit);

    return res.status(200).json({ data });
  } catch (error) {
    console.error('Failed to list commentary:', error);
    return res.status(500).json({ error: 'Failed to list commentary' });
  }
});

commentaryRouter.post('/', async (req, res) => {
  const parsedParams = matchIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ error: 'Invalid params', details: parsedParams.error.issues });
  }

  const parsedBody = createCommentarySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsedBody.error.issues });
  }

  const { id: matchId } = parsedParams.data;

  try {
    const [entry] = await db
      .insert(commentary)
      .values({
        matchId,
        ...parsedBody.data,
      })
      .returning();

    try {
      res.app.locals.broadcastCommentary?.(entry.matchId, entry);
    } catch (broadcastError) {
      console.error('Failed to broadcast commentary:', broadcastError);
    }

    return res.status(201).json({ data: entry });
  } catch (error) {
    console.error('Failed to create commentary:', error);
    return res.status(500).json({ error: 'Failed to create commentary' });
  }
});
