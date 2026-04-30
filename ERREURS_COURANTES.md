# Erreurs courantes à éviter — Comment Service

## 1. Oublier `npx prisma generate` après chaque modification du schema

**Symptôme** : `Property 'comment' does not exist on type 'PrismaClient'`

**Cause** : Le client Prisma n'est pas régénéré après un changement de `schema.prisma`.

**Correction** :
```bash
npx prisma generate
# Puis redémarrer le serveur
```

---

## 2. Ne pas appliquer le trigger SQL après la migration

**Symptôme** : On peut créer des commentaires de niveau 3, 4, ... sans erreur.

**Cause** : `prisma migrate dev` crée les tables mais pas les triggers SQL custom.

**Correction** :
```bash
psql $DATABASE_URL -f prisma/migrations/depth_trigger.sql
```

---

## 3. Utiliser `offset` au lieu du curseur pour la pagination

**Symptôme** : Des doublons ou sauts apparaissent entre les pages quand de nouveaux commentaires sont créés.

**Cause** : `OFFSET N` est instable sur des données qui bougent.

**Correction** : Utiliser la pagination par curseur déjà implémentée (`cursor` = dernier UUID reçu).

---

## 4. Retourner l'entité Prisma brute depuis le controller

**Symptôme** : Des champs internes (ex: `authorId` brut, champs techniques) sont exposés au client.

**Cause** : `return comment` au lieu de `return CommentResponseDto.from(comment)`.

**Correction** : Toujours passer par le DTO de réponse. Ne jamais retourner une entité Prisma directement.

---

## 5. Oublier `@Transform` sur le content du DTO

**Symptôme** : Des commentaires avec des espaces uniquement (`"   "`) sont acceptés.

**Cause** : `class-validator` valide la string avant le trim.

**Correction** : Le `@Transform` est déjà dans `CreateCommentDto`. S'assurer que `transform: true` est dans `ValidationPipe`.

---

## 6. Ne pas gérer le `noAck: false` sur le consumer RabbitMQ

**Symptôme** : Les messages `publication.deleted` sont traités plusieurs fois, ou perdus si le service crash.

**Cause** : Sans acquittement manuel, RabbitMQ considère le message traité dès la réception.

**Correction** : Garder `noAck: false` et appeler `channel.ack(message)` après traitement réussi.

---

## 7. Injecter `PrismaService` directement dans le `CommentsService`

**Symptôme** : Impossible de mocker la base de données dans les tests unitaires.

**Cause** : Le service dépend d'une implémentation concrète plutôt que de l'interface.

**Correction** : Le `CommentsService` reçoit `ICommentsRepository` via le token `COMMENTS_REPOSITORY`. Ne jamais injecter `PrismaService` directement dans le service métier.

---

## 8. Ne pas trim le content avant persistance

**Symptôme** : Des commentaires avec des espaces en début/fin sont enregistrés en base.

**Correction** : Le `@Transform` dans le DTO + `dto.content.trim()` dans le service sont déjà en place. Vérifier que `ValidationPipe` a `transform: true`.

---

## 9. Mauvais ordre des filtres globaux dans `main.ts`

**Symptôme** : Les erreurs domaine retournent un format inattendu (celui du filtre de validation).

**Cause** : NestJS applique les filtres dans l'ordre inverse de leur déclaration.

**Correction** : Déclarer `DomainExceptionFilter` en premier, `ValidationExceptionFilter` en second.
```typescript
app.useGlobalFilters(
  new DomainExceptionFilter(),      // plus spécifique
  new ValidationExceptionFilter(),  // plus générique
);
```

---

## 10. Mettre la logique métier dans le controller ou le repository

**Symptôme** : Duplication de code, règles de profondeur vérifiées à plusieurs endroits.

**Règle d'or** :
- **Controller** : HTTP uniquement (parser la requête, formater la réponse)
- **Service** : toute la logique métier (profondeur, soft delete intelligent, autorisation)
- **Repository** : accès DB uniquement (requêtes Prisma, pas de règles métier)

---

## 11. Oublier d'exporter `CommentsService` depuis `CommentsModule`

**Symptôme** : `Nest can't resolve dependencies of the PublicationConsumer`

**Cause** : `MessagingModule` importe `CommentsModule` mais `CommentsService` n'est pas exporté.

**Correction** : Vérifier que `exports: [CommentsService]` est dans `CommentsModule`.

---

## 12. Ne pas redémarrer après modification de `.env`

**Symptôme** : Les modifications de variables d'environnement ne sont pas prises en compte.

**Correction** : Arrêter et relancer `npm run start:dev`. NestJS ne recharge pas `.env` à chaud.
