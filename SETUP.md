

# Comment Service — Guide de démarrage complet

## 1. Prérequis — versions recommandées

| Outil       | Version minimale | Vérification         |
|-------------|-----------------|----------------------|
| Node.js     | 20.x LTS        | `node --version`     |
| npm         | 10.x            | `npm --version`      |
| PostgreSQL  | 15.x            | `psql --version`     |
| RabbitMQ    | 3.12.x          | `rabbitmqctl version` |

---

## 2. Installation PostgreSQL + création de la base

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# macOS (Homebrew)
brew install postgresql@15 && brew services start postgresql@15

# Créer l'utilisateur et la base
sudo -u postgres psql <<EOF
CREATE USER comment_user WITH PASSWORD 'comment_pass';
CREATE DATABASE comment_db OWNER comment_user;
GRANT ALL PRIVILEGES ON DATABASE comment_db TO comment_user;
EOF

# Vérifier la connexion
psql postgresql://comment_user:comment_pass@localhost:5432/comment_db -c "SELECT 1;"
```

---

## 3. Installation RabbitMQ

```bash
# Ubuntu / Debian
sudo apt install -y rabbitmq-server
sudo systemctl start rabbitmq-server
sudo systemctl enable rabbitmq-server

# macOS (Homebrew)
brew install rabbitmq && brew services start rabbitmq

# Docker (alternative rapide)
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management

# Interface web RabbitMQ : http://localhost:15672 (guest/guest)
```

---

## 4. Cloner et installer le projet

```bash
# Copier le projet dans votre répertoire
cd /votre/repertoire

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env
# Éditer .env si vos identifiants PostgreSQL ou RabbitMQ diffèrent
```

---

## 5. Configuration base de données

```bash
# Générer le client Prisma (obligatoire avant tout)
npx prisma generate

# Créer les tables via migration Prisma
npx prisma migrate dev --name init

# Appliquer le trigger de profondeur (après la migration)
psql postgresql://comment_user:comment_pass@localhost:5432/comment_db \
  -f prisma/migrations/depth_trigger.sql

# (Optionnel) Vérifier le schéma dans Prisma Studio
npx prisma studio
```

---

## 6. Lancer le projet

```bash
# Mode développement (hot-reload)
npm run start:dev

# Mode production
npm run build && npm run start:prod
```

Vous devriez voir :
```
[Bootstrap] Comment Service running on port 3003
[CommentProducer] Connecté à RabbitMQ (producer)
```

---

## 7. Tests unitaires

```bash
# Lancer tous les tests
npm test

# Mode watch
npm run test:watch

# Avec couverture
npm run test:cov
```

---

## 8. Tests manuels — scénarios curl complets

### Variables d'environnement pour les tests

```bash
export BASE_URL="http://localhost:3003"
export PUB_ID="11111111-1111-1111-1111-111111111111"
export USER_ID="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
export USER2_ID="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
```

---

### Scénario 1 — Créer un commentaire racine

```bash
curl -s -X POST "$BASE_URL/comments" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" \
  -d '{
    "publicationId": "'"$PUB_ID"'",
    "content": "Très belle propriété, le quartier est-il calme ?"
  }' | jq .
```

Réponse attendue (201) :
```json
{
  "success": true,
  "data": {
    "id": "UUID-GENERE",
    "content": "Très belle propriété, le quartier est-il calme ?",
    "publicationId": "11111111-...",
    "parentId": null,
    "status": "active",
    "author": { "id": "aaaaaaaa-..." },
    "likeCount": 0,
    "replyCount": 0,
    "replies": [],
    "createdAt": "2025-04-06T...",
    "updatedAt": "2025-04-06T..."
  },
  "meta": null,
  "timestamp": "2025-04-06T..."
}
```

```bash
# Sauvegarder l'ID pour la suite
export COMMENT_ID="<id retourné ci-dessus>"
```

---

### Scénario 2 — Créer une réponse (niveau 2)

```bash
curl -s -X POST "$BASE_URL/comments" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $USER2_ID" \
  -H "X-User-Email: bob@example.com" \
  -d '{
    "publicationId": "'"$PUB_ID"'",
    "content": "Oui, le quartier est très calme, peu de circulation.",
    "parentId": "'"$COMMENT_ID"'"
  }' | jq .

export REPLY_ID="<id retourné>"
```

---

### Scénario 3 — Tenter un niveau 3 (doit échouer 422)

```bash
curl -s -X POST "$BASE_URL/comments" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" \
  -d '{
    "publicationId": "'"$PUB_ID"'",
    "content": "Tentative niveau 3",
    "parentId": "'"$REPLY_ID"'"
  }' | jq .
```

Réponse attendue (422) :
```json
{
  "success": false,
  "error": {
    "code": "COMMENT_DEPTH_EXCEEDED",
    "message": "Profondeur maximale atteinte (limite : 2 niveaux)"
  },
  "timestamp": "..."
}
```

---

### Scénario 4 — Lister les commentaires d'une publication

```bash
curl -s "$BASE_URL/publications/$PUB_ID/comments?limit=10&sort=desc" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" | jq .
```

Réponse attendue (200) avec pagination :
```json
{
  "success": true,
  "data": [ { "id": "...", "replies": [...], "replyCount": 1 } ],
  "meta": {
    "limit": 10,
    "hasMore": false,
    "nextCursor": null
  },
  "timestamp": "..."
}
```

---

### Scénario 5 — Pagination par curseur

```bash
# Page 1
RESULT=$(curl -s "$BASE_URL/publications/$PUB_ID/comments?limit=2" \
  -H "X-User-Id: $USER_ID" -H "X-User-Email: alice@example.com")

echo $RESULT | jq .meta
CURSOR=$(echo $RESULT | jq -r '.meta.nextCursor')

# Page 2 avec curseur
curl -s "$BASE_URL/publications/$PUB_ID/comments?limit=2&cursor=$CURSOR" \
  -H "X-User-Id: $USER_ID" -H "X-User-Email: alice@example.com" | jq .
```

---

### Scénario 6 — Lister les réponses d'un commentaire

```bash
curl -s "$BASE_URL/comments/$COMMENT_ID/replies" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" | jq .
```

---

### Scénario 7 — Supprimer son propre commentaire (tombstone car il a des réponses)

```bash
curl -s -X DELETE "$BASE_URL/comments/$COMMENT_ID" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" | jq .
```

Réponse attendue (200) avec status tombstoned :
```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "tombstoned",
    "deletedAt": "..."
  },
  "timestamp": "..."
}
```

---

### Scénario 8 — Supprimer le commentaire d'un autre (doit échouer 403)

```bash
curl -s -X DELETE "$BASE_URL/comments/$REPLY_ID" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" | jq .
```

Réponse attendue (403) :
```json
{
  "success": false,
  "error": {
    "code": "COMMENT_FORBIDDEN",
    "message": "Action interdite : suppression d'un commentaire dont vous n'êtes pas l'auteur"
  }
}
```

---

### Scénario 9 — Requête sans headers d'auth (doit échouer 401)

```bash
curl -s -X POST "$BASE_URL/comments" \
  -H "Content-Type: application/json" \
  -d '{ "publicationId": "'"$PUB_ID"'", "content": "Test" }' | jq .
```

---

### Scénario 10 — Validation DTO (doit échouer 400)

```bash
curl -s -X POST "$BASE_URL/comments" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $USER_ID" \
  -H "X-User-Email: alice@example.com" \
  -d '{ "publicationId": "pas-un-uuid", "content": "" }' | jq .
```

---

## 9. Simuler un événement RabbitMQ publication.deleted

Via la console RabbitMQ (http://localhost:15672) ou en CLI :

```bash
# Publier un message dans la queue publications_queue
# Payload JSON attendu :
# {
#   "pattern": "publication.deleted",
#   "data": {
#     "publicationId": "11111111-1111-1111-1111-111111111111",
#     "deletedAt": "2025-04-06T14:00:00.000Z"
#   }
# }

# Via l'interface web RabbitMQ :
# 1. Aller sur http://localhost:15672
# 2. Onglet "Queues" → publications_queue
# 3. "Publish message" → coller le payload ci-dessus
```

---

## 10. Arborescence finale du projet

```
comment-service/
├── .env                          # Variables d'environnement
├── .env.example                  # Template pour l'équipe
├── nest-cli.json
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma             # Schéma Prisma (source de vérité DB)
│   └── migrations/
│       └── depth_trigger.sql     # Trigger de profondeur max = 2
└── src/
    ├── main.ts                   # Point d'entrée, config globale
    ├── app.module.ts             # Module racine
    ├── prisma/
    │   ├── prisma.service.ts     # Client Prisma injectable
    │   └── prisma.module.ts      # Module global Prisma
    ├── common/
    │   ├── decorators/
    │   │   └── current-user.decorator.ts
    │   ├── filters/
    │   │   ├── domain-exception.filter.ts
    │   │   └── validation-exception.filter.ts
    │   ├── guards/
    │   │   └── jwt-auth.guard.ts
    │   └── interfaces/
    │       ├── api-response.interface.ts
    │       └── authenticated-user.interface.ts
    ├── comments/
    │   ├── comments.controller.ts
    │   ├── comments.service.ts
    │   ├── comments.module.ts
    │   ├── domain/
    │   │   ├── comment.constants.ts
    │   │   └── comment.errors.ts
    │   ├── dto/
    │   │   ├── create-comment.dto.ts
    │   │   ├── query-comments.dto.ts
    │   │   └── comment-response.dto.ts
    │   ├── interfaces/
    │   │   └── comments-repository.interface.ts
    │   ├── repositories/
    │   │   └── prisma-comments.repository.ts
    │   └── tests/
    │       └── comments.service.spec.ts
    └── messaging/
        ├── messaging.module.ts
        ├── producers/
        │   └── comment.producer.ts
        └── consumers/
            └── publication.consumer.ts
```
