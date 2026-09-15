import type { DancePostStatus } from "@bnewapp/dance-core";
import type { DecorationSnapshot, StudioCatalog } from "@bnewapp/studio-core";
import type { Database } from "./database.generated.js";

export type { Database } from "./database.generated.js";

// Pure dance-domain contracts (status unions, scan status, coercion) live in
// @bnewapp/dance-core and are re-exported so consumers import them from one place.
export type {
  DancePostStatus,
  ScanJobState,
  ScanStatus,
  ScanStatusRow,
} from "@bnewapp/dance-core";

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  code: string;
  message: string;
}

// Studio-domain shapes, not transport-only DTOs: they live in @bnewapp/studio-core
// and are re-exported so consumers keep importing them from one place.
export type {
  CatalogItemAccess,
  CatalogItemDTO,
  CatalogItemStatus,
  StudioCatalog,
} from "@bnewapp/studio-core";

export type DanceContentStatus = "draft" | "published";

export type AdminDanceGenre = Omit<
  Database["public"]["Tables"]["dance_genres"]["Row"],
  "status"
> & {
  status: DanceContentStatus;
};

export type AdminMusicTrack = Omit<
  Database["public"]["Tables"]["music_tracks"]["Row"],
  "status"
> & {
  status: DanceContentStatus;
};

export type AdminDanceMove = Omit<Database["public"]["Tables"]["dance_moves"]["Row"], "status"> & {
  status: DanceContentStatus;
  genre_ids: string[];
};

export type DanceMediaTarget = "move" | "track";

export interface DanceMediaUploadRequest {
  target: DanceMediaTarget;
  field: string;
  recordId?: string;
  filename: string;
}

export interface DanceMediaUploadTicket {
  path: string;
  token: string;
  publicUrl: string;
  contentType: string;
}

export interface Wallet {
  glow: number;
}

export interface InventoryItem {
  itemId: string;
  acquiredAt: string;
}

export interface Inventory {
  items: InventoryItem[];
}

export interface PurchaseItemBody {
  itemId: string;
}

export interface PurchaseItemResult {
  wallet: Wallet;
  item: InventoryItem;
}

export type StudioCatalogResponse = ApiSuccess<StudioCatalog>;

export interface HealthStatus {
  status: "ok";
  timestamp: string;
}

export interface UserProfile {
  createdAt: string;
  id: string;
  email: string;
}

/** A profile row enriched with the auth fields needed by the admin user list. */
export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  created_at: string;
  last_sign_in_at: string | null;
  app_metadata_role: string | null;
}

/** Full user record returned by the admin user-detail endpoint. */
export interface AdminUserDetail extends AdminUserRow {
  email_confirmed_at: string | null;
  studio_room: {
    template_id: string;
    item_count: number;
    updated_at: string;
  } | null;
}

/** Aggregate metrics displayed on the internal admin dashboard. */
export interface DashboardSummary {
  users: {
    total: number;
    last24h: number;
    last7d: number;
    last30d: number;
  };
  rooms: {
    total: number;
    updatedLast7d: number;
  };
}

/** A user's persisted studio room as returned by the API. */
export interface StudioRoom {
  id: string;
  ownerId: string;
  snapshot: DecorationSnapshot;
  updatedAt: string;
}

/** The owner's room detail, including the aggregate displayed in Studio. */
export type StudioRoomWithVisitorCount = StudioRoom & {
  visitorCount: number;
};

/** Body for PUT /api/studio/room — the full decoration snapshot to persist. */
export type SaveStudioRoomBody = DecorationSnapshot;

/**
 * A room in the Explore feed. Omits StudioRoom.id because the schema has one
 * room per owner and ownerId is the public stable key. `username` is a non-null
 * database invariant, so it is always present.
 */
export type ExploreRoom = Omit<StudioRoom, "id"> & {
  username: string;
};

/** A room detail returned after recording an authenticated visitor's visit. */
export type VisitedStudioRoom = ExploreRoom & {
  visitorCount: number;
};

/** Keyset cursor for the Explore feed, ordered by (updatedAt desc, id desc). */
export interface ExploreRoomsCursor {
  updatedAt: string;
  id: string;
}

/** A page of Explore rooms with the cursor to fetch the next page, if any. */
export interface ExploreRoomsPage {
  items: ExploreRoom[];
  nextCursor: ExploreRoomsCursor | null;
}

// --- Dance flow (consumer) -------------------------------------------------
// Curated wire shapes for the consumer dance feature. Camelcase like the other
// app-facing DTOs (StudioRoom, ExploreRoom); the server maps DB columns onto them.

/** A published genre in the consumer catalog. */
export interface DanceGenre {
  id: string;
  name: string;
  sortOrder: number;
}

/** The music track joined onto a move, carrying the beat-drop offset the Record
 * screen seeks to. */
export interface DanceMoveMusic {
  id: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  /** ms into the track where the choreography begins; null → play from the start. */
  delayBeforeAvatarDance: number | null;
}

/**
 * A published, scannable move. Eligible moves always have a filmYourselfVideoUrl
 * (the PiP reference + expert_url), so it is non-null here.
 */
export interface DanceMove {
  id: string;
  title: string;
  description: string | null;
  level: number;
  bpm: number | null;
  thumbnailUrl: string | null;
  mainVideoUrl: string | null;
  proDancerVideoUrl: string | null;
  proDancerImageUrl: string | null;
  dancerTipVideoUrl: string | null;
  dancerTipImageUrl: string | null;
  presentationVideoUrl: string | null;
  filmYourselfVideoUrl: string;
  genreIds: string[];
  music: DanceMoveMusic | null;
  sortOrder: number;
  createdAt: string;
}

/** Keyset cursor for the moves feed, ordered by (sortOrder, createdAt, id). */
export interface DanceMovesCursor {
  sortOrder: number;
  createdAt: string;
  id: string;
}

/** A page of moves with the cursor to fetch the next page, if any. */
export interface DanceMovesPage {
  items: DanceMove[];
  nextCursor: DanceMovesCursor | null;
}

/** A user's recorded attempt. `videoUrl` is a short-lived signed read URL for
 * display only; the private Storage object path remains the source of truth. */
export interface DancePost {
  id: string;
  danceMoveId: string;
  musicId: string | null;
  status: DancePostStatus;
  score: number | null;
  videoLengthS: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Keyset cursor for the owner's post history, ordered by (createdAt desc, id desc). */
export interface DancePostsCursor {
  createdAt: string;
  id: string;
}

export interface DancePostHistoryItem extends DancePost {
  videoUrl: string;
  /** The recording remuxed with the move's music; null until the media job completes. */
  mergedVideoUrl: string | null;
  thumbnailUrl: string | null;
  /** Stable storage path behind `thumbnailUrl`; the signed URL rotates, this does not. */
  thumbnailPath: string | null;
  blurhash: string | null;
}

/** Move metadata available with an owned recording, even when the move is no longer published. */
export interface DancePostMoveDetail {
  title: string;
  description: string | null;
  music: {
    title: string;
    artist: string | null;
  } | null;
}

export interface DancePostDetail extends DancePostHistoryItem {
  danceMove: DancePostMoveDetail;
}

export interface DancePostsPage {
  items: DancePostHistoryItem[];
  nextCursor: DancePostsCursor | null;
}

/** Body for POST /api/dance/posts — musicId is resolved server-side from the move. */
export interface CreateDancePostBody {
  danceMoveId: string;
  videoLength: number;
  /**
   * Music playhead at the first recorded frame, measured on device. Omitted when the
   * player never started; the merge then falls back to the computed timeline offset.
   * The explicit `| undefined` is load-bearing under `exactOptionalPropertyTypes`.
   */
  audioOffsetMs?: number | undefined;
}

/** Supabase Storage signed upload target for the amateur recording. */
export interface DancePostUpload {
  signedUrl: string;
  path: string;
}

/** Result of POST /api/dance/posts: the created post id and where to upload. */
export interface CreateDancePostResult {
  postId: string;
  upload: DancePostUpload;
}
