import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().optional(),
  OSRM_URL: z.string().url().optional(), // наприклад http://localhost:5000
  MAPBOX_TOKEN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid ENV:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
