import { drizzle } from 'drizzle-orm/neon-serverless';
import { z } from 'zod';

const env = z.object({
  DATABASE_URL: z.url()
}).parse(process.env);

export const db = drizzle(env.DATABASE_URL);