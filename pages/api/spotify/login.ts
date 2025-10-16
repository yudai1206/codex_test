import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { setCookie } from '../../../lib/cookies';
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateRandomString,
} from '../../../lib/spotify';

const MethodSchema = z.literal('GET');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const methodCheck = MethodSchema.safeParse(req.method);
  if (!methodCheck.success) {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);

    setCookie(res, 'spotify_code_verifier', codeVerifier, {
      maxAge: 10 * 60,
    });
    setCookie(res, 'spotify_auth_state', state, {
      maxAge: 10 * 60,
    });

    const authorizeUrl = buildAuthorizeUrl({
      codeChallenge,
      state,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
