import { createTestStore } from "@bnewapp/mobile-kit/testing";
import type { CreateDancePostResult, DancePost } from "@bnewapp/types";
import {
  createDancePost,
  discardUploadingDancePost,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../../api";
import { submitDanceRecordingMutationAtom } from "../mutations";

jest.mock("../../api", () => ({
  createDancePost: jest.fn(),
  deleteRecordedDancePost: jest.fn(),
  discardUploadingDancePost: jest.fn(),
  markDancePostUploaded: jest.fn(),
  uploadDanceVideo: jest.fn(),
}));

const mockedCreateDancePost = jest.mocked(createDancePost);
const mockedUploadDanceVideo = jest.mocked(uploadDanceVideo);
const mockedMarkDancePostUploaded = jest.mocked(markDancePostUploaded);
const mockedDiscardUploadingDancePost = jest.mocked(discardUploadingDancePost);

const AUTH = { userId: "00000000-0000-4000-8000-000000000000", accessToken: "token" };
const POST_ID = "00000000-0000-4000-8000-000000000010";
const SIGNED_URL = "https://storage.test/upload";
const CLIP_PATH = "file:///clip.mp4";

const INPUT = { danceMoveId: "move-1", path: CLIP_PATH, videoLength: 12, audioOffsetMs: 250 };

function created(): CreateDancePostResult {
  return {
    postId: POST_ID,
    upload: { signedUrl: SIGNED_URL, path: `${AUTH.userId}/${POST_ID}.mp4` },
  };
}

function queued(): DancePost {
  return {
    id: POST_ID,
    danceMoveId: INPUT.danceMoveId,
    musicId: null,
    status: "uploaded",
    score: null,
    videoLengthS: INPUT.videoLength,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function submit() {
  const { store } = createTestStore({ auth: AUTH });
  return store.get(submitDanceRecordingMutationAtom).mutateAsync(INPUT);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreateDancePost.mockResolvedValue(created());
  mockedUploadDanceVideo.mockResolvedValue(undefined);
  mockedMarkDancePostUploaded.mockResolvedValue(queued());
  mockedDiscardUploadingDancePost.mockResolvedValue(undefined);
});

it("creates the post, uploads the clip to its signed URL, then queues the scan", async () => {
  await expect(submit()).resolves.toBe(POST_ID);

  expect(mockedCreateDancePost).toHaveBeenCalledWith(AUTH.accessToken, {
    danceMoveId: INPUT.danceMoveId,
    videoLength: INPUT.videoLength,
    audioOffsetMs: INPUT.audioOffsetMs,
  });
  expect(mockedUploadDanceVideo).toHaveBeenCalledWith(SIGNED_URL, CLIP_PATH);
  expect(mockedMarkDancePostUploaded).toHaveBeenCalledWith(AUTH.accessToken, POST_ID);
  expect(mockedDiscardUploadingDancePost).not.toHaveBeenCalled();
});

it("omits the audio offset when the music player never started", async () => {
  const { store } = createTestStore({ auth: AUTH });

  await store
    .get(submitDanceRecordingMutationAtom)
    .mutateAsync({ ...INPUT, audioOffsetMs: undefined });

  expect(mockedCreateDancePost).toHaveBeenCalledWith(AUTH.accessToken, {
    danceMoveId: INPUT.danceMoveId,
    videoLength: INPUT.videoLength,
  });
});

it("discards the created post when the upload fails, and reports the upload error", async () => {
  const uploadError = new Error("Unable to upload dance video");
  mockedUploadDanceVideo.mockRejectedValue(uploadError);

  await expect(submit()).rejects.toThrow(uploadError);

  expect(mockedDiscardUploadingDancePost).toHaveBeenCalledWith(AUTH.accessToken, POST_ID);
  expect(mockedMarkDancePostUploaded).not.toHaveBeenCalled();
});

it("discards the created post when queueing the scan fails", async () => {
  mockedMarkDancePostUploaded.mockRejectedValue(new Error("Unable to queue dance scan"));

  await expect(submit()).rejects.toThrow("Unable to queue dance scan");

  expect(mockedDiscardUploadingDancePost).toHaveBeenCalledWith(AUTH.accessToken, POST_ID);
});

it("keeps the original failure when the rollback itself fails", async () => {
  mockedUploadDanceVideo.mockRejectedValue(new Error("Unable to upload dance video"));
  mockedDiscardUploadingDancePost.mockRejectedValue(new Error("network down"));

  await expect(submit()).rejects.toThrow("Unable to upload dance video");
});

it("never creates a post when there is no session to authorize it", async () => {
  const { store } = createTestStore();

  await expect(store.get(submitDanceRecordingMutationAtom).mutateAsync(INPUT)).rejects.toThrow();

  expect(mockedCreateDancePost).not.toHaveBeenCalled();
});
