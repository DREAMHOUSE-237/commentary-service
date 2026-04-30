export const COMMENT_CONSTRAINTS = {
  MAX_DEPTH:          2,
  MIN_CONTENT_LENGTH: 1,
  MAX_CONTENT_LENGTH: 5000,
  REPORT_THRESHOLD:   5,
} as const;

export const CommentStatus = {
  ACTIVE:     'active',
  TOMBSTONED: 'tombstoned', // supprimé mais conservé pour ses réponses
  DELETED:    'deleted',    // supprimé définitivement (logiquement)
  MODERATED:  'moderated',  // masqué après seuil de signalements
} as const;

export type CommentStatusType = typeof CommentStatus[keyof typeof CommentStatus];

export const COMMENTS_REPOSITORY = Symbol('ICommentsRepository');
