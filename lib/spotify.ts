import crypto from 'node:crypto';
import type { NextApiRequest } from 'next';
import { z } from 'zod';

import { getEnv } from './env';

const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  scope: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const RecentlyPlayedSchema = z.object({
  items: z.array(
    z.object({
      played_at: z.string(),
      track: z.object({
        name: z.string(),
        duration_ms: z.number(),
        artists: z.array(z.object({ name: z.string() })),
        album: z.object({
          images: z
            .array(
              z.object({
                url: z.string(),
                height: z.number().nullable().optional(),
                width: z.number().nullable().optional(),
              })
            )
            .optional()
            .default([]),
        }),
      }),
    })
  ),
});

export type RecentlyPlayedResponse = z.infer<typeof RecentlyPlayedSchema>;

export const SpotifyRecentItemSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album_image_url: z.string().nullable(),
  played_at: z.string(),
  duration_ms: z.number(),
});

export type SpotifyRecentItem = z.infer<typeof SpotifyRecentItemSchema>;

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

export function generateRandomString(length: number) {
  return toBase64Url(crypto.randomBytes(length));
}

export function generateCodeVerifier() {
  return generateRandomString(64);
}

export function generateCodeChallenge(verifier: string) {
  return toBase64Url(crypto.createHash('sha256').update(verifier).digest());
}

export function getCookies(req: NextApiRequest) {
  return req.cookies ?? {};
}

export function buildAuthorizeUrl({
  codeChallenge,
  state,
}: {
  codeChallenge: string;
  state: string;
}) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } = getEnv();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: 'user-read-recently-played',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken({
  code,
  codeVerifier,
}: {
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI } = getEnv();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier,
    client_secret: SPOTIFY_CLIENT_SECRET,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const parsed = TokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Unexpected token response shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = getEnv();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
    client_secret: SPOTIFY_CLIENT_SECRET,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const parsed = TokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Unexpected refresh response shape: ${parsed.error.message}`);
  }

  return parsed.data;
}

export function mapRecentItems(data: RecentlyPlayedResponse): SpotifyRecentItem[] {
  return data.items.map((item) => {
    const { track, played_at } = item;
    const albumImage = track.album.images?.[0]?.url ?? null;
    const artistNames = track.artists.map((artist) => artist.name).join(', ');

    return {
      title: track.name,
      artist: artistNames,
      album_image_url: albumImage,
      played_at,
      duration_ms: track.duration_ms,
    };
  });
}
