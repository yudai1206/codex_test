# Spotify OAuth with Next.js API Routes

このプロジェクトは Next.js (TypeScript) の API Routes を利用して Spotify の OAuth (PKCE) 認証フローを実装しています。以下の 3 つのエンドポイントを提供します。

- `GET /api/spotify/login` – Spotify の認可画面にリダイレクトします。
- `GET /api/spotify/callback` – Spotify からのコールバックを受け取り、アクセストークンとリフレッシュトークンを HttpOnly Cookie に保存します。
- `GET /api/spotify/recent` – 認証済みユーザーの直近 50 曲の再生履歴を JSON として返却します。

## 環境変数

`.env.local` に以下の値を設定してください（雛形は `.env.example` を参照）。

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI` (`/api/spotify/callback` を指す URL)

## 開発サーバーの起動

```bash
npm install
npm run dev
```

## エンドポイントの詳細

### `/api/spotify/login`

- PKCE に必要な Code Verifier / Code Challenge を生成します。
- 検証に用いる `state` と `code_verifier` を HttpOnly Cookie に保存します。
- Spotify の認可エンドポイントへ 302 リダイレクトします。

### `/api/spotify/callback`

- クエリパラメータの検証を Zod で行います。
- `state` の整合性と `code_verifier` の存在をチェックします。
- Spotify のトークンエンドポイントへリクエストし、アクセストークンとリフレッシュトークンを取得します。
- 取得したトークンとアクセストークンの有効期限 (UNIX タイム) を HttpOnly Cookie (Secure / SameSite=Lax) に保存します。

### `/api/spotify/recent`

- Cookie に保存されたアクセストークンを利用して Spotify API から直近 50 曲を取得します。
- アクセストークンの有効期限切れが検出された場合、リフレッシュトークンを使用して自動的に再取得します。
- `title`, `artist`, `album_image_url`, `played_at`, `duration_ms` の配列を JSON として返却します。
- エラーレスポンスは JSON 形式で返されます。

## 注意事項

- Cookie はすべて HttpOnly / Secure / SameSite=Lax で設定されます。開発環境で HTTPS を使用しない場合、ブラウザによっては Cookie が保存されないことがあります。
- この実装は Next.js の API Routes (Node.js ランタイム) を前提としています。
