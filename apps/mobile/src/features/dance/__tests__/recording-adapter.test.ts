const mockDownloadFileAsync = jest.fn();
const mockFileConstructor = jest.fn();
const mockExistingFileNames = new Set<string>();

jest.mock("expo-file-system", () => ({
  Directory: class {
    create = jest.fn();
  },
  File: class {
    name: string;
    uri: string;
    static downloadFileAsync: (...args: unknown[]) => Promise<{ uri: string }> = (...args) =>
      mockDownloadFileAsync(...args);
    constructor(...args: unknown[]) {
      mockFileConstructor(...args);
      this.name = String(args[args.length - 1]);
      this.uri = `file:///cache/dance-recording-simulation/${this.name}`;
    }
    get exists() {
      return mockExistingFileNames.has(this.name);
    }
  },
  Paths: { cache: "file:///cache" },
}));

import { createSimulatedDanceRecorder } from "../recording-adapter";

const SOURCE_URL = "https://example.test/reference.mp4";

/**
 * `preloadSimulatedDanceVideo` memoizes per source URL for the life of the
 * module, so each test uses a distinct URL to get an un-memoized download.
 */
function uniqueSource(name: string) {
  return `${SOURCE_URL}?${name}`;
}

function downloadedFileName(): string {
  const call = mockDownloadFileAsync.mock.calls.at(-1);
  return (call?.[1] as { name: string }).name;
}

beforeEach(() => {
  mockDownloadFileAsync.mockReset();
  mockDownloadFileAsync.mockImplementation(async (_url: string, file: { uri: string }) => ({
    uri: file.uri,
  }));
  mockFileConstructor.mockClear();
  mockExistingFileNames.clear();
});

it("returns a cached MP4 when a simulated recording is stopped", async () => {
  const recorder = await createSimulatedDanceRecorder(uniqueSource("stop"), 60);
  const onFinished = jest.fn();

  await recorder.startRecording(onFinished, jest.fn());
  expect(recorder.isRecording).toBe(true);

  await recorder.stopRecording();

  expect(recorder.isRecording).toBe(false);
  expect(onFinished).toHaveBeenCalledWith(
    `file:///cache/dance-recording-simulation/${downloadedFileName()}`,
  );
});

it("does not finish a simulated recording after cancellation", async () => {
  jest.useFakeTimers();
  try {
    const recorder = await createSimulatedDanceRecorder(uniqueSource("cancel"), 60);
    const onFinished = jest.fn();

    await recorder.startRecording(onFinished, jest.fn());
    await recorder.cancelRecording();
    await jest.runAllTimersAsync();

    expect(onFinished).not.toHaveBeenCalled();
    expect(recorder.isRecording).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it("downloads the reference into the simulation cache directory", async () => {
  await createSimulatedDanceRecorder(uniqueSource("download"), 60);

  expect(mockFileConstructor).toHaveBeenCalledWith(
    expect.anything(),
    expect.stringMatching(/\.mp4$/),
  );
  expect(mockDownloadFileAsync).toHaveBeenCalledTimes(1);
});

it("gives two moves sharing a file name their own cache entries", async () => {
  await createSimulatedDanceRecorder("https://example.test/moves/a/reference.mp4", 60);
  const first = downloadedFileName();
  await createSimulatedDanceRecorder("https://example.test/moves/b/reference.mp4", 60);
  const second = downloadedFileName();

  expect(mockDownloadFileAsync).toHaveBeenCalledTimes(2);
  expect(first).not.toBe(second);
});

it("reuses a file left in the cache by an earlier JS session instead of re-downloading", async () => {
  const source = uniqueSource("cached");
  await createSimulatedDanceRecorder(source, 60);
  mockExistingFileNames.add(downloadedFileName());
  mockDownloadFileAsync.mockClear();

  // A fresh module registry stands in for a relaunch: the in-memory promise map
  // is gone, but the downloaded file is still on disk.
  const reimported: { adapter: typeof import("../recording-adapter") | null } = { adapter: null };
  jest.isolateModules(() => {
    reimported.adapter = require("../recording-adapter");
  });
  if (reimported.adapter === null) throw new Error("recording-adapter was not re-imported");
  await reimported.adapter.createSimulatedDanceRecorder(source, 60);

  expect(mockDownloadFileAsync).not.toHaveBeenCalled();
});
