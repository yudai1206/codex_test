import type { NextApiResponse } from 'next';
import { serialize, type CookieSerializeOptions } from 'cookie';

export type CookieValue = string | number | boolean | null | undefined;

const baseCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export function setCookie(
  res: NextApiResponse,
  name: string,
  value: CookieValue,
  options: CookieSerializeOptions = {}
) {
  const stringValue = value ?? '';
  const cookie = serialize(name, String(stringValue), {
    ...baseCookieOptions,
    ...options,
  });

  const existingSetCookie = res.getHeader('Set-Cookie');
  if (typeof existingSetCookie === 'string') {
    res.setHeader('Set-Cookie', [existingSetCookie, cookie]);
  } else if (Array.isArray(existingSetCookie)) {
    res.setHeader('Set-Cookie', [...existingSetCookie, cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}

export function clearCookie(res: NextApiResponse, name: string) {
  setCookie(res, name, '', { maxAge: 0, expires: new Date(0) });
}
