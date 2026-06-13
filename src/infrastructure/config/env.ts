import { z } from 'zod';

const envSchema = z.object({
  // App
  PORT: z.coerce.number().default(8000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/atendimento'),

  // Redis / Queue
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Meta WhatsApp Cloud API
  META_VERIFY_TOKEN: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_TOKEN: z.string().default('mock-token'),
  META_API_BASE_URL: z.string().url().default('http://localhost:8001'),
  META_PHONE_NUMBER_ID: z.string().min(1).default('123456789012345'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  cachedEnv = envSchema.parse(process.env);
  return cachedEnv;
}
