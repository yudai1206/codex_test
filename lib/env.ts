import { z } from 'zod';

const EnvSchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1, 'Missing SPOTIFY_CLIENT_ID'),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, 'Missing SPOTIFY_CLIENT_SECRET'),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url('SPOTIFY_REDIRECT_URI must be a valid URL pointing to /api/spotify/callback'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let cachedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const aggregated = parsed.error.errors.map((issue) => issue.message).join(', ');
    throw new Error(`Invalid environment variables: ${aggregated}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
