/**
 * The local collection: what the user has learned, and the videos they chose to
 * keep. Both live on the device only and are keyed by `moveId` alone — this app
 * has no user ids, and a lost anonymous session must not orphan them.
 */

/**
 * The projection of `DanceMove` cached at learn time, so the profile renders a
 * learned move whose catalog row later changes or is unpublished.
 */
export interface LearnedMoveSnapshot {
  title: string;
  thumbnailUrl: string | null;
  genreIds: string[];
  level: number;
  /** The official video resolved at learn time; the caller's fallback chain ends at `filmYourselfVideoUrl`. */
  videoUrl: string;
}

export interface LearnedMove {
  moveId: string;
  /** Integer, 0..100. */
  savedScore: number;
  /** `false` for a server fallback score, which still counts towards Average Score. */
  isExternalScore: boolean;
  /** ISO; set once, never re-dated. */
  learnedAt: string;
  /** ISO; changes only on a confirmed score replacement. */
  updatedAt: string;
  move: LearnedMoveSnapshot;
}

export interface PersonalRecording {
  moveId: string;
  /**
   * A bare file name inside the app-document recordings directory, never a path: the
   * container directory is reassigned on reinstall and on restore from backup, so an
   * absolute path stored today resolves to nothing tomorrow.
   */
  fileName: string;
  createdAt: string;
  durationS: number;
}
