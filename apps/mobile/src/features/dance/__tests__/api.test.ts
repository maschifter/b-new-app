const mockVideoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
const mockBytes = jest.fn().mockResolvedValue(mockVideoBytes);
const mockFileConstructor = jest.fn();
const mockFileSize = { value: (11 * 1024 * 1024) as number | null };
const mockExpoFetch = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class {
    constructor(...uris: string[]) {
      mockFileConstructor(...uris);
    }
    get size() {
      return mockFileSize.value;
    }
    bytes = mockBytes;
  },
}));
// The factory is hoisted above the `const` below, so the reference must stay lazy.
jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockExpoFetch(...args),
}));

import {
  createDancePost,
  deleteRecordedDancePost,
  discardUploadingDancePost,
  getDancePost,
  getDancePosts,
  getDanceScoreStatus,
  markDancePostUploaded,
  uploadDanceVideo,
} from "../api";

const fetchMock = jest.fn();

function success(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

beforeEach(() => {
  fetchMock.mockReset();
  mockExpoFetch.mockReset();
  mockFileConstructor.mockClear();
  mockBytes.mockClear();
  mockFileSize.value = 11 * 1024 * 1024;
  global.fetch = fetchMock;
});

it("creates a post, uploads its local MP4, and marks it uploaded", async () => {
  fetchMock
    .mockResolvedValueOnce(
      success({
        postId: "00000000-0000-4000-8000-000000000010",
        upload: { signedUrl: "https://storage.example.test/upload", path: "dancer/attempt.mp4" },
      }),
    )
    .mockResolvedValueOnce(
      success({
        id: "00000000-0000-4000-8000-000000000010",
        danceMoveId: "00000000-0000-4000-8000-000000000001",
        musicId: null,
        status: "uploaded",
        score: null,
        videoLengthS: 12,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  mockExpoFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

  const created = await createDancePost("token", {
    danceMoveId: "00000000-0000-4000-8000-000000000001",
    videoLength: 12,
  });
  await uploadDanceVideo(created.upload.signedUrl, "file:///cache/attempt.mp4");
  const post = await markDancePostUploaded("token", created.postId);

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining("/api/dance/posts"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        danceMoveId: "00000000-0000-4000-8000-000000000001",
        videoLength: 12,
      }),
    }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(`/api/dance/posts/${created.postId}/uploaded`),
    expect.objectContaining({ method: "POST" }),
  );
  expect(post.status).toBe("uploaded");
});

it("uploads the file's bytes so the global whatwg-fetch body path is never used", async () => {
  mockExpoFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

  await uploadDanceVideo("https://storage.example.test/upload", "file:///cache/attempt.mp4");

  expect(mockFileConstructor).toHaveBeenCalledWith("file:///cache/attempt.mp4");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockExpoFetch).toHaveBeenCalledWith("https://storage.example.test/upload", {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: mockVideoBytes,
  });
});

it("discards an incomplete post with the caller's authorization", async () => {
  fetchMock.mockResolvedValueOnce(success(null));

  await discardUploadingDancePost("token", "00000000-0000-4000-8000-000000000010");

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/dance/posts/00000000-0000-4000-8000-000000000010/upload"),
    expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});

it("deletes a recorded post through the post resource, not the upload sub-resource", async () => {
  fetchMock.mockResolvedValueOnce(success(null));

  await deleteRecordedDancePost("token", "00000000-0000-4000-8000-000000000010");

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/dance\/posts\/00000000-0000-4000-8000-000000000010$/),
    expect.objectContaining({
      method: "DELETE",
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});

it("reports a rejected upload instead of queueing an empty object for scanning", async () => {
  mockExpoFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));

  await expect(
    uploadDanceVideo("https://storage.example.test/upload", "file:///cache/attempt.mp4"),
  ).rejects.toThrow("Unable to upload dance video");
});

it("returns the normalized score status", async () => {
  fetchMock.mockResolvedValueOnce(
    success({
      status: "scored",
      hasScore: true,
      score: 96,
      isExternalScore: false,
      jobState: "completed",
    }),
  );

  await expect(
    getDanceScoreStatus("token", "00000000-0000-4000-8000-000000000010"),
  ).resolves.toMatchObject({ status: "scored", score: 96 });
});

it("requests the owner-only dance history with its opaque cursor", async () => {
  fetchMock.mockResolvedValueOnce(success({ items: [], nextCursor: null }));

  await getDancePosts("token", {
    cursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000010" },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/dance/posts?limit=18&cursor="),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});

it("requests one owner-only recorded dance by id", async () => {
  const postId = "00000000-0000-4000-8000-000000000010";
  fetchMock.mockResolvedValueOnce(
    success({
      id: postId,
      danceMoveId: "00000000-0000-4000-8000-000000000001",
      musicId: null,
      status: "scored",
      score: 92,
      videoLengthS: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      videoUrl: "https://storage.example.test/attempt.mp4",
    }),
  );

  await getDancePost("token", postId);

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(`/api/dance/posts/${postId}`),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }),
  );
});

it("refuses a clip larger than the upload ceiling before reading it into memory", async () => {
  mockFileSize.value = 65 * 1024 * 1024;

  await expect(
    uploadDanceVideo("https://storage.example.test/upload", "file:///cache/attempt.mp4"),
  ).rejects.toThrow("This recording is too large to upload");
  expect(mockBytes).not.toHaveBeenCalled();
  expect(mockExpoFetch).not.toHaveBeenCalled();
});

it("uploads when the platform cannot report a file size", async () => {
  mockFileSize.value = null;
  mockExpoFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

  await uploadDanceVideo("https://storage.example.test/upload", "file:///cache/attempt.mp4");

  expect(mockExpoFetch).toHaveBeenCalledTimes(1);
});
