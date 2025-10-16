import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { clearCookie, setCookie } from '../../../lib/cookies';
import {
  exchangeCodeForToken,
  getCookies,
} from '../../../lib/spotify';

const QuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const MethodSchema = z.literal('GET');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const methodCheck = MethodSchema.safeParse(req.method);
  if (!methodCheck.success) {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code, state, error } = QuerySchema.parse(req.query);

  if (error) {
    return res.status(400).json({ error });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  const cookies = getCookies(req);
  const storedState = cookies['spotify_auth_state'];
  const codeVerifier = cookies['spotify_code_verifier'];

  if (!storedState || storedState !== state) {
    return res.status(400).json({ error: 'Invalid OAuth state' });
  }

  if (!codeVerifier) {
    return res.status(400).json({ error: 'Missing PKCE code verifier' });
  }

  try {
    const tokenResponse = await exchangeCodeForToken({
      code,
      codeVerifier,
    });

    clearCookie(res, 'spotify_code_verifier');
    clearCookie(res, 'spotify_auth_state');

    setCookie(res, 'spotify_access_token', tokenResponse.access_token, {
      maxAge: tokenResponse.expires_in,
    });

    if (tokenResponse.refresh_token) {
      setCookie(res, 'spotify_refresh_token', tokenResponse.refresh_token, {
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + tokenResponse.expires_in;
    setCookie(res, 'spotify_access_token_expires_at', expiresAt, {
      maxAge: tokenResponse.expires_in,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
