import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { setCookie } from '../../../lib/cookies';
import {
  RecentlyPlayedSchema,
  SpotifyRecentItemSchema,
  getCookies,
  mapRecentItems,
  refreshAccessToken,
} from '../../../lib/spotify';

const MethodSchema = z.literal('GET');

class SpotifyUnauthorizedError extends Error {}

async function ensureAccessToken(req: NextApiRequest, res: NextApiResponse) {
  const cookies = getCookies(req);
  const accessToken = cookies['spotify_access_token'];
  const refreshToken = cookies['spotify_refresh_token'];
  const expiresAtString = cookies['spotify_access_token_expires_at'];

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = expiresAtString ? Number(expiresAtString) : undefined;
  const isExpired = typeof expiresAt === 'number' && expiresAt <= now + 30;

  if (accessToken && !isExpired) {
    return { accessToken, refreshed: false } as const;
  }

  if (!refreshToken) {
    return { accessToken: null, refreshed: false } as const;
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);
    setCookie(res, 'spotify_access_token', refreshed.access_token, {
      maxAge: refreshed.expires_in,
    });
    const newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;
    setCookie(res, 'spotify_access_token_expires_at', newExpiresAt, {
      maxAge: refreshed.expires_in,
    });

    if (refreshed.refresh_token) {
      setCookie(res, 'spotify_refresh_token', refreshed.refresh_token, {
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return { accessToken: refreshed.access_token, refreshed: true } as const;
  } catch (error) {
    return { accessToken: null, refreshed: false } as const;
  }
}

async function fetchRecentItems(accessToken: string) {
  const response = await fetch(
    'https://api.spotify.com/v1/me/player/recently-played?limit=50',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status === 401) {
    throw new SpotifyUnauthorizedError('Access token expired');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API error: ${errorText || response.statusText}`);
  }

  const payload = await response.json();
  const parsed = RecentlyPlayedSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(`Invalid Spotify response: ${parsed.error.message}`);
  }

  const items = mapRecentItems(parsed.data);
  return z.array(SpotifyRecentItemSchema).parse(items);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const methodCheck = MethodSchema.safeParse(req.method);
  if (!methodCheck.success) {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const accessResult = await ensureAccessToken(req, res);

    if (!accessResult.accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }

    try {
      const items = await fetchRecentItems(accessResult.accessToken);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ items });
    } catch (error) {
      if (error instanceof SpotifyUnauthorizedError) {
        const retry = await ensureAccessToken(req, res);
        if (!retry.accessToken || retry.accessToken === accessResult.accessToken) {
          return res.status(401).json({ error: 'Spotify access token expired' });
        }

        const items = await fetchRecentItems(retry.accessToken);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ items });
      }

      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
