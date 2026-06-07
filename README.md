# Game News API — Backend

API REST pour Game News : agregation d'actualites Steam, notifications push,
sync multi-utilisateurs distribuee.

> Documentation source de verite : ce README couvre l'API publique et les
> commandes. Pour les details d'architecture interne (modeles, services,
> patterns), voir `.claude/rules/backend.md` et `CLAUDE.md` a la racine.

## Stack

- Node.js >= 18
- Express 4.21
- MongoDB + Mongoose 8.12
- Agenda.js 5 — scheduler persistant (jobs en collection `agendaJobs`)
- Firebase Admin 13 — notifications push (FCM)
- Sentry Node 10 — monitoring (optionnel)
- Pino — logger structure
- bcryptjs, cookie-parser, helmet — securite

## Tests

531 tests unitaires + integration via Jest + MongoDB Memory Server.

```bash
npm test                # full suite (~10s)
npm run test:unit       # tests/unit/
npm run test:integration
npm run test:coverage   # + rapport HTML coverage/
npm run test:ci         # CI mode (--ci --runInBand --coverage)
```

CI bloquante : `coverageThreshold` configure dans `jest.config.js`
(global 80% lines/functions, 65% branches ; seuils plus stricts par dossier
critique : `middleware/`, `services/steam/`, `services/newsFeed/`).

## Lancement

```bash
npm install
cp .env.example .env       # puis remplir MONGODB_URI et STEAM_API_KEY
npm run dev                # nodemon
npm start                  # production
```

Le serveur ecoute par defaut sur `:5000`.

## Configuration (.env)

Voir `.env.example` pour la liste complete et commentee. Resume :

| Variable | Required | Defaut | Note |
|----------|:--------:|--------|------|
| `MONGODB_URI` | oui | — | exit(1) si absent |
| `STEAM_API_KEY` | oui | — | exit(1) si absent |
| `PORT` | non | 5000 | |
| `NODE_ENV` | non | development | active `/api/debug` si dev |
| `CORS_ORIGINS` | non | `*` | a restreindre en prod |
| `MOBILE_REDIRECT_SCHEME` | non | `steamnotif` | deep link app |
| `MOBILE_SESSION_SECRET` | recommande | fallback STEAM_API_KEY | HMAC sessions mobiles |
| `MOBILE_SESSION_TTL_DAYS` | non | 30 | |
| `ADMIN_STEAM_IDS` | non | vide | allowlist mobile admin |
| `ADMIN_TOKEN` | non | vide | Bearer pour curl `/admin` |
| `ADMIN_PASSWORD_HASH` | non | vide | bcrypt UI `/admin` |
| `ADMIN_SESSION_SECRET` | non | vide | cookie signe `/admin` |
| `NOTIFICATION_PROVIDER` | non | `simulation` | `simulation` ou `firebase` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | si firebase | — | chemin JSON |
| `STEAMGRIDDB_API_KEY` | non | vide | icones HQ |
| `RESEND_API_KEY` | non | vide | feedback emails |
| `SENTRY_DSN` | non | vide | desactive si vide |

## Authentification

**Steam OpenID 2.0** uniquement (pas de mot de passe). Flow mobile :

1. `POST /auth/steam/start` → renvoie `authToken` + URL Steam OpenID
2. L'app ouvre cette URL dans le navigateur, user se logge sur Steam
3. Steam redirige sur `GET /auth/steam/return?authToken=...` qui :
   - verifie la signature OpenID aupres de Steam (check_authentication)
   - cree/met a jour l'utilisateur en base
   - redirige vers le deep link mobile
4. L'app poll `GET /auth/steam/status/:authToken` → recoit un `sessionToken`
   HMAC SHA-256 signe (TTL configurable)
5. Toutes les requetes mobiles suivantes envoient
   `Authorization: Bearer <sessionToken>`

Cote serveur :
- `mobileSessionAuth` valide la signature + expiration du token
- `requireSelf` verifie que la session correspond au steamId cible de la route
- Sans ces deux middlewares, **toutes** les routes `/api/users/*`,
  `/api/news/feed`, `/api/steam/:steamId/*` repondraient 401

## Endpoints

### Auth (publics)

```
POST /auth/steam/start            -> { authToken, authUrl }
GET  /auth/steam/status/:token    -> { status, steamId?, sessionToken? }
GET  /auth/steam/return           -> redirect vers deep link mobile
```

### Healthcheck (public)

```
GET /healthz                       -> 200 { status: 'ok', checks: {...} }
                                      503 si Mongo ou Agenda KO
```

### Users (auth + ownership requis)

```
POST   /api/users/register
GET    /api/users/:steamId
PUT    /api/users/:steamId/notifications
POST   /api/users/:steamId/fcm-token
DELETE /api/users/:steamId/fcm-token
PUT    /api/users/:steamId/active-games
POST   /api/users/:steamId/follow
DELETE /api/users/:steamId/follow/:appId
POST   /api/users/:steamId/news-favorites
DELETE /api/users/:steamId/news-favorites/:appId/:newsId
GET    /api/users/:steamId/followed-games-details
PUT    /api/users/:steamId/news/seen
PUT    /api/users/:steamId/language
DELETE /api/users/:steamId
```

### News

```
GET /api/news/game/:appId          (public) — news d'un jeu
GET /api/news/feed?steamId=...     (auth + ownership) — fil agrege
```

### Steam

```
GET  /api/steam/search?q=...                        (public)
GET  /api/steam/status/:steamId                     (auth + ownership)
GET  /api/steam/games/:steamId[?refresh=recent]     (auth + ownership)
GET  /api/steam/profile/:steamId                    (auth + ownership)
GET  /api/steam/wishlist/:steamId                   (auth + ownership)
POST /api/steam/check-visibility/:steamId           (auth + ownership)
POST /api/steam/check-wishlist-visibility/:steamId  (auth + ownership)
```

### Web (public-par-SteamID — plugin Millennium + extension navigateur)

Surface sans login : tourner dans le client Steam connecte (ou lire un SteamID
public sur le site) = la preuve d'identite (modele assume). Lectures sensibles
gardees par le secret d'appairage Millennium (`requireWebSecretIfPaired`) ; les
writes follow et le read d'etat restent publics. Liste complete : voir
`.claude/rules/backend.md`.

```
GET    /api/web/profile/:steamId                 (gate si appaire)
GET    /api/web/library/:steamId                 (gate si appaire)
GET    /api/web/settings/:steamId
GET    /api/web/follow  ?steamId&appId           — suivre (idempotent)
POST   /api/web/follow
GET    /api/web/follow-state/:steamId/:appId     — { followed } (cloche store)
DELETE /api/web/follow/:steamId/:appId           — ne plus suivre
GET    /api/web/unfollow/:steamId/:appId         — idem en GET (proxy Lua)
PUT    /api/web/notifications/:steamId
PUT    /api/web/language/:steamId
GET    /api/web/heartbeat/:steamId               — presence desktop
GET|POST /api/web/register/:steamId              — provisioning (202)
```

### Feedback (public, rate-limite 3/min)

```
POST /api/feedback                 -> envoi email via Resend
```

### Admin

Deux faces, partagent le meme service de stats :

- **Web UI** `GET /admin` — dashboard HTML autonome, login bcrypt + cookie signe
  HttpOnly, CSP nonce-based, refresh auto 30s
- **API curl** `GET /admin/stats` — `Authorization: Bearer <ADMIN_TOKEN>`
- **API mobile** `GET /api/admin/stats` — session mobile + steamId dans
  `ADMIN_STEAM_IDS`

```
GET /admin                        (UI)
POST /admin/login                 (UI auth)
POST /admin/logout                (UI auth)
GET  /admin/stats[/overview|/polling|/crons]   (Bearer ou cookie)
GET  /api/admin/access            (session mobile)
GET  /api/admin/stats[/...]       (session mobile + admin allowlist)
```

### Debug (NODE_ENV=development uniquement)

```
POST /api/debug/simulate-news-notification
POST /api/debug/force-wishlist-sync
```

## Crons (Agenda v5, timezone Europe/Paris)

| Job | Cron | Lock | Description |
|-----|------|------|-------------|
| `news-check` | `*/30 * * * *` | 15 min | Polling adaptatif news (tiers hot/warm/cold) |
| `user-group-sync` | `0 3-14 * * *` | 15 min | 1 des 12 buckets par heure (cycle 12h) |
| `wishlist-sync` | `30 3-14 * * *` | 15 min | Idem, offset +30 min |

Jobs persistants en `agendaJobs` (Mongo). Survivent aux redemarrages.
`groupIndex = (hour - 3 + 24) % 12`, hash DJB2 de `user._id`.

### Polling adaptatif (`news-check`)

| Tier | Condition | Cooldown |
|------|-----------|----------|
| Hot | jamais checke OU news < 30j | 1 h |
| Warm | news 30-60j | 6 h |
| Cold | news > 60j ou aucune | 24 h |

Limite : **200 appels Steam max / run** (`MAX_STEAM_NEWS_CALLS_PER_RUN`).
Eligibilite via `GameSubscription.nextNewsCheckAt <= now`.

## Modeles (Mongoose)

- **`User`** — steamId, language, followedGames[], notificationSettings
  (fcmTokens[], modes follow), gameLibrary, wishlist, newsFavorites,
  versioning gamesVersion/wishlistVersion
- **`GameSubscription`** — gameId, name, imageUrl, subscribers[],
  lastNewsTimestamp, nextNewsCheckAt
- **`UserNewsState`** — dedup `{steamId, appId, newsId}`, inFeedAt,
  pushSentAt, TTL 90j auto
- **`Game`** — metadonnees Steam (name, header_image)
- **`Wishlist`** — pareil pour la wishlist

## Securite

- Auth par session mobile signee HMAC (cf. section Authentification)
- `requireSelf` empeche tout acces croise (mismatch session/cible -> 403)
- `helmet` global pose les headers de securite par defaut
- `/admin` : CSP nonce-based, cookie signe HttpOnly SameSite=Strict,
  bcrypt cost 12, dummy hash pour timing-safe login, `Sentry` integre
- `crypto.timingSafeEqual` pour la comparaison Bearer admin
- Rate limiters : `steamLimiter` 10/min, `authLimiter` 10/min,
  `apiLimiter` 60/min, `adminLimiter` 30/min, `feedbackLimiter` 3/min
- `SIMULATION_CONFIG.privateProfile=true` pour simuler profil prive en dev
- CORS configurable, par defaut `*` (a restreindre en prod)

## Monitoring

- **Sentry** — backend `@sentry/node`, init dans `instrument.js` charge
  AVANT tout autre require (auto-instrumentation OpenTelemetry).
  Desactive si `SENTRY_DSN` vide.
- **Healthcheck** `/healthz` pour Railway/k8s : verifie Mongo + Agenda
- **Pino** — logger structure (`utils/logger.js`)

## Deploiement

Production cible : Railway. Variables critiques :
- `NODE_ENV=production`
- `MONGODB_URI`, `STEAM_API_KEY`
- `MOBILE_SESSION_SECRET` (explicite, ne pas s'appuyer sur le fallback)
- `CORS_ORIGINS` restreint
- `FIREBASE_SERVICE_ACCOUNT_JSON` (string JSON) ou
  `FIREBASE_SERVICE_ACCOUNT_PATH` (fichier)
- `ADMIN_TOKEN`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`
- `SENTRY_DSN`, `SENTRY_RELEASE`

`trust proxy: 1` deja configure pour Railway/reverse proxy.

## Scripts utilitaires

```
node scripts/generate-admin-password.js <password>  # bcrypt hash
node scripts/test-notification.js
node scripts/test-follow-prompt.js
node scripts/trigger-real-notification.js
node scripts/trigger-family-test.js [steamId]
```

## Liens

- Steam Web API : https://steamcommunity.com/dev
- Agenda.js : https://github.com/agenda/agenda
- Mongoose : https://mongoosejs.com
- Sentry Node : https://docs.sentry.io/platforms/node/
