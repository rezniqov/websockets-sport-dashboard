import { z } from 'zod';

export const listMatchesQuerySchema = z.object({
   limit: z.coerce.number().int().positive().max(100).optional(),
});

export const MATCH_STATUS = {
   SCHEDULED: 'scheduled',
   LIVE: 'live',
   FINISHED: 'finished',
};

export const matchIdParamSchema = z.object({
   id: z.coerce.number().int().positive(),
});

export const createMatchSchema = z
   .object({
      sport: z.string().min(1),
      homeTeam: z.string().min(1),
      awayTeam: z.string().min(1),
      startTime: z.iso.datetime(),
      endTime: z.iso.datetime(),
      homeScore: z.coerce.number().int().nonnegative().optional(),
      awayScore: z.coerce.number().int().nonnegative().optional(),
   })
   .superRefine(({ startTime, endTime }, ctx) => {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (end.getTime() <= start.getTime()) {
         ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endTime'],
            message: 'endTime must be after startTime',
         });
      }
   });

export const updateScoreSchema = z.object({
   homeScore: z.coerce.number().int().nonnegative(),
   awayScore: z.coerce.number().int().nonnegative(),
});
