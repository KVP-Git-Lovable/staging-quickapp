
# Real Push Notifications (Android APK + Installed PWA)

Every insert into `public.notifications` becomes a real device push, with per-user opt-in and self-suppression via `metadata.actor_id`.

## 0. Firebase Web App setup (you do this first, then paste keys)

Before I can wire the PWA:

1. Firebase Console → your project → Project settings → General → **Add app → Web**. Register it (nickname e.g. "QuickApp PWA"). Copy the config: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
2. Same project → Cloud Messaging tab → **Web configuration** → Generate key pair → copy the **VAPID public key**.
3. Project settings → Service accounts → **Generate new private key** → download JSON (used by the edge function).

Paste back:
- Web config values (I'll add them to `.env` as `VITE_FIREBASE_*` — publishable, safe in client)
- VAPID public key → `VITE_FIREBASE_VAPID_KEY`
- Service account JSON → I'll store as secret `FIREBASE_SERVICE_ACCOUNT`

## 1. Database

New migration:

- Table `public.push_device_tokens` (`id`, `user_id`, `token unique`, `platform` check-in `('android','ios','web')`, `device_info jsonb`, `created_at`, `updated_at` + updated_at trigger). GRANTs for `authenticated` + `service_role`. RLS: user manages own rows; service_role reads all.
- Extend `public.notification_preferences` semantics — add key `push_enabled boolean default true` (per user master toggle), reusing existing per-type rows for type-level suppression.
- Trigger `notifications_push_dispatch` — `AFTER INSERT ON public.notifications`:
  - Skip if `NEW.user_id IS NULL`.
  - Skip if `NEW.metadata->>'actor_id' = NEW.user_id::text`.
  - `net.http_post` (pg_net) to the `send-push` edge function with `{ user_id, title, body: message, data: { route: coalesce(metadata->>'route', ...) , notification_id, type } }`, using the service-role key from `vault`/GUC.

## 2. Edge function `send-push`

`supabase/functions/send-push/index.ts`, `verify_jwt = false` (called from DB trigger with a shared secret header validated in-function; also usable from client for test).

- Input Zod-validated: `{ user_id: uuid, title: string, body: string, data?: { route?: string, ...} }`.
- Load master `push_enabled` from `notification_preferences`; short-circuit if disabled.
- Load all `push_device_tokens` for `user_id`.
- Mint a Google OAuth2 access token from `FIREBASE_SERVICE_ACCOUNT` (JWT → token endpoint), cached in-memory per invocation.
- Send FCM HTTP v1 `messages:send` per token with platform-specific config (Android channel, Web `fcm_options.link` = deep link, WebPush notification payload with icon).
- On response `UNREGISTERED` / 404 / 410 → delete that token row.
- Log every attempt into `public.notification_event_log` (status, error, token id).
- CORS headers on all responses.

Secrets required: `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `PUSH_TRIGGER_SHARED_SECRET`.

## 3. Client — Capacitor Android

- `bun add @capacitor/push-notifications`; `npx cap sync` note for the user.
- New `src/utils/pushRegistration.ts`:
  - `registerNativePush(userId)` — request permission, `PushNotifications.register()`, on `registration` upsert `{ user_id, token, platform: 'android' (or 'ios'), device_info: { model, os } }` into `push_device_tokens`.
  - `pushNotificationReceived` (foreground) → show local toast/banner.
  - `pushNotificationActionPerformed` → `navigate(data.route)`.
  - `unregisterNativePush()` on logout → delete row by token.
- Call from `useAuth`/root effect after login when `Capacitor.isNativePlatform()`.

## 4. Client — PWA (Firebase Cloud Messaging Web)

- `bun add firebase`.
- `public/firebase-messaging-sw.js` — dedicated messaging worker (separate from existing Workbox `service-worker.ts`, per project rules). Initializes Firebase with the web config, handles `onBackgroundMessage` → `self.registration.showNotification(title, { body, icon, data })`, and `notificationclick` → focus/open `data.route`.
- `src/lib/firebaseMessaging.ts` — `initWebPush(userId)`: guard for non-native + `Notification` supported + not in Lovable preview iframe; register `/firebase-messaging-sw.js`; `getToken({ vapidKey, serviceWorkerRegistration })`; upsert token with `platform: 'web'`; `onMessage` → in-app toast + `refetch` of `useNotifications`.
- Settings screen: add a **Push notifications** toggle (writes `notification_preferences.push_enabled`). Only this toggle triggers `Notification.requestPermission()` + token registration — never on first load.
- Logout: delete the token row and call `deleteToken()`.

## 5. Wiring the deep link

Existing notification `metadata.route` (or derived from `related_table`/`related_id`) is passed through as `data.route`. Both native handler and web `notificationclick` navigate to it via the app router when opened.

## 6. Verification

- Insert a test row via `supabase--insert` into `public.notifications` for a test user with the app killed on Android → banner appears, tap opens deep link.
- Same for installed desktop Chrome PWA with the tab closed.
- Insert a row where `metadata.actor_id = user_id` → no push, but in-app notification still appears.
- Toggle push off in settings → subsequent inserts don't push.

## Technical notes

- Existing Workbox `src/service-worker.ts` is untouched; `firebase-messaging-sw.js` is a separate worker (different scope/file) — allowed by the PWA skill.
- `pg_net` extension will be enabled in the migration if not already.
- All hex/type/schema changes live in one migration; RLS + GRANTs included per project rules.
- No changes to existing notification-creation code paths.

## Deliverables

1. Migration: `push_device_tokens` + trigger + `push_enabled` preference default.
2. Edge function: `send-push` + secrets requested via `add_secret`.
3. Client code: `pushRegistration.ts`, `firebaseMessaging.ts`, `public/firebase-messaging-sw.js`, settings toggle, auth hookups.
4. Env vars added to `.env` for web Firebase config once you paste them.
