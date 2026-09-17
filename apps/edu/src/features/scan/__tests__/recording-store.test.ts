// `expo-file-system` is mocked here rather than in `apps/edu/__mocks__/`: a mock
// adjacent to `node_modules` is applied automatically to every suite in the app, and a
// file-system fake has no business inside a screen test that never touches one.
const mockFiles = new Map<string, number>();
const mockDirectories = new Set<string>();
const mockFsCalls: string[] = [];

jest.mock("expo-file-system", () => {
  function join(parts: unknown[]): string {
    return parts
      .map((part) => (typeof part === "string" ? part : (part as { uri: string }).uri))
      .reduce((left, right) => (left.endsWith("/") ? `${left}${right}` : `${left}/${right}`));
  }

  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockFsCalls.push(`create-dir:${this.uri}`);
      mockDirectories.add(this.uri);
    }
    list() {
      const prefix = `${this.uri}/`;
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(prefix))
        .map((uri) => new File(uri));
    }
    delete() {
      mockFsCalls.push(`delete-dir:${this.uri}`);
      mockDirectories.delete(this.uri);
    }
  }

  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri) ?? 0;
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf("/") + 1);
    }
    copy(destination: { uri: string }) {
      mockFsCalls.push(`copy:${this.uri}->${destination.uri}`);
      const size = mockFiles.get(this.uri);
      if (size === undefined) throw new Error(`no such file: ${this.uri}`);
      mockFiles.set(destination.uri, size);
    }
    delete() {
      mockFsCalls.push(`delete:${this.uri}`);
      mockFiles.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { document: "file:///document", cache: "file:///cache" } };
});

import {
  deleteTemporaryClip,
  isPlayableClip,
  reconcilePersonalRecordings,
  savePersonalRecordingFile,
} from "../recording-store";

const MOVE_ID = "00000000-0000-4000-8000-000000000001";
const RECORDINGS = "file:///document/personal-recordings";
const CLIP = "file:///cache/VisionCamera/attempt.mov";
const NOW = 1_770_000_000_000;

beforeEach(() => {
  mockFiles.clear();
  mockDirectories.clear();
  mockFsCalls.length = 0;
});

describe("isPlayableClip", () => {
  it("accepts a local file that holds bytes", () => {
    mockFiles.set(CLIP, 2_048);
    expect(isPlayableClip(CLIP)).toBe(true);
  });

  it("rejects a missing file, an empty file and a remote URL", () => {
    expect(isPlayableClip(CLIP)).toBe(false);
    mockFiles.set(CLIP, 0);
    expect(isPlayableClip(CLIP)).toBe(false);
    expect(isPlayableClip("https://cdn.test/clip.mp4")).toBe(false);
  });
});

describe("deleteTemporaryClip", () => {
  it("deletes the user's capture", () => {
    mockFiles.set(CLIP, 2_048);
    deleteTemporaryClip(CLIP);
    expect(mockFiles.has(CLIP)).toBe(false);
  });

  it("never deletes a clip under the simulation directory", () => {
    const simulated = "file:///cache/dance-recording-simulation/a1b2c3d4.mp4";
    mockFiles.set(simulated, 2_048);
    deleteTemporaryClip(simulated);
    expect(mockFiles.has(simulated)).toBe(true);
    expect(mockFsCalls).toEqual([]);
  });
});

describe("savePersonalRecordingFile", () => {
  const FILE_NAME = `${MOVE_ID}-${NOW}.mp4`;
  const PREVIOUS = `${MOVE_ID}-1.mp4`;

  // The collection as the screen passes it: the pointer write and the read-back beside it.
  function pointerStore(initial: string | null, accepts = true) {
    let stored = initial;
    return {
      persist: jest.fn((input: { moveId: string; fileName: string; durationS: number }) => {
        mockFsCalls.push("persist");
        if (accepts) stored = input.fileName;
      }),
      readPersisted: () => stored,
    };
  }

  function save(previousFileName: string | null, store = pointerStore(previousFileName)) {
    return savePersonalRecordingFile({
      moveId: MOVE_ID,
      clipPath: CLIP,
      durationS: 12.4,
      previousFileName,
      persist: store.persist,
      readPersisted: store.readPersisted,
      now: () => NOW,
    });
  }

  it("copies the clip into the document directory and stores the file name alone", () => {
    mockFiles.set(CLIP, 2_048);
    const store = pointerStore(null);

    const fileName = save(null, store);

    expect(fileName).toBe(FILE_NAME);
    expect(store.persist).toHaveBeenCalledWith({ moveId: MOVE_ID, fileName, durationS: 12.4 });
    expect(mockFiles.get(`${RECORDINGS}/${fileName}`)).toBe(2_048);
    expect(mockFiles.has(CLIP)).toBe(false);
  });

  it("deletes the previous file only after the copy exists and the pointer is written", () => {
    mockFiles.set(CLIP, 2_048);
    mockFiles.set(`${RECORDINGS}/${PREVIOUS}`, 1_024);

    const fileName = save(PREVIOUS);

    expect(mockFsCalls).toEqual([
      `create-dir:${RECORDINGS}`,
      `copy:${CLIP}->${RECORDINGS}/${fileName}`,
      "persist",
      `delete:${RECORDINGS}/${PREVIOUS}`,
      `delete:${CLIP}`,
    ]);
    expect(mockFiles.has(`${RECORDINGS}/${PREVIOUS}`)).toBe(false);
  });

  it("leaves the pointer and the old file untouched when the copy throws", () => {
    mockFiles.set(`${RECORDINGS}/${PREVIOUS}`, 1_024);
    const store = pointerStore(PREVIOUS);

    expect(() => save(PREVIOUS, store)).toThrow();
    expect(store.persist).not.toHaveBeenCalled();
    expect(mockFiles.get(`${RECORDINGS}/${PREVIOUS}`)).toBe(1_024);
  });

  it("leaves the old file in place when the copy produces an empty file", () => {
    mockFiles.set(CLIP, 0);
    mockFiles.set(`${RECORDINGS}/${PREVIOUS}`, 1_024);
    const store = pointerStore(PREVIOUS);

    expect(() => save(PREVIOUS, store)).toThrow();
    expect(store.persist).not.toHaveBeenCalled();
    expect(mockFiles.get(`${RECORDINGS}/${PREVIOUS}`)).toBe(1_024);
  });

  it("keeps the old video and removes the new copy when the store rejects the pointer", () => {
    mockFiles.set(CLIP, 2_048);
    mockFiles.set(`${RECORDINGS}/${PREVIOUS}`, 1_024);
    const store = pointerStore(PREVIOUS, false);

    expect(() => save(PREVIOUS, store)).toThrow();

    expect(store.persist).toHaveBeenCalled();
    expect(mockFiles.get(`${RECORDINGS}/${PREVIOUS}`)).toBe(1_024);
    expect(mockFiles.has(`${RECORDINGS}/${FILE_NAME}`)).toBe(false);
    expect(mockFiles.has(CLIP)).toBe(true);
  });

  it("keeps a simulated clip after saving it as a personal recording", () => {
    const simulated = "file:///cache/dance-recording-simulation/a1b2c3d4.mp4";
    mockFiles.set(simulated, 2_048);
    let stored: string | null = null;

    savePersonalRecordingFile({
      moveId: MOVE_ID,
      clipPath: simulated,
      durationS: 5,
      previousFileName: null,
      persist: ({ fileName }) => {
        stored = fileName;
      },
      readPersisted: () => stored,
      now: () => NOW,
    });

    expect(mockFiles.has(simulated)).toBe(true);
  });
});

describe("reconcilePersonalRecordings", () => {
  it("drops a pointer whose file is gone", () => {
    const dropPointer = jest.fn();
    mockDirectories.add(RECORDINGS);

    reconcilePersonalRecordings({ pointers: { [MOVE_ID]: `${MOVE_ID}-1.mp4` }, dropPointer });

    expect(dropPointer).toHaveBeenCalledWith(MOVE_ID);
  });

  it("deletes a file no pointer references and keeps the referenced one", () => {
    const referenced = `${MOVE_ID}-1.mp4`;
    const orphan = `${MOVE_ID}-2.mp4`;
    mockDirectories.add(RECORDINGS);
    mockFiles.set(`${RECORDINGS}/${referenced}`, 1_024);
    mockFiles.set(`${RECORDINGS}/${orphan}`, 1_024);
    const dropPointer = jest.fn();

    reconcilePersonalRecordings({ pointers: { [MOVE_ID]: referenced }, dropPointer });

    expect(dropPointer).not.toHaveBeenCalled();
    expect(mockFiles.has(`${RECORDINGS}/${referenced}`)).toBe(true);
    expect(mockFiles.has(`${RECORDINGS}/${orphan}`)).toBe(false);
  });

  it("does nothing when the directory has never been created", () => {
    const dropPointer = jest.fn();
    reconcilePersonalRecordings({ pointers: {}, dropPointer });
    expect(mockFsCalls).toEqual([]);
  });
});
