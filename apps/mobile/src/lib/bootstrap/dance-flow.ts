import { configureDanceFlow } from "@/features/dance/config";
import { apiUrl } from "@/lib/api/client";

// The dance flow is app-agnostic; this is where b-new-app supplies its own base
// URL and MMKV store id. Imported for side effect by the root layout so it runs
// before anything renders or requests.
configureDanceFlow({ apiUrl, mmkvId: "dance" });
