import { apiUrl } from "@/lib/api/client";
import { configureDanceFlow } from "@bnewapp/dance-flow/config";

// The dance flow is app-agnostic; this is where Stepz supplies its own base URL
// and MMKV store id. Imported for side effect by the root layout so it runs
// before anything renders or requests. The store id is the flow's own, separate
// from this app's `edu` store.
configureDanceFlow({ apiUrl, mmkvId: "edu-dance" });
