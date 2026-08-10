import type { ImageSource } from "expo-image";

// Presentation-only theme art for the studio. The room geometry (spots, frames,
// accept rules, seed decorations) now lives in the shared, RN-free domain
// package @bnewapp/studio-core; this file holds just the pieces that depend on
// the mobile bundle (bundled images) or are pure presentation (fill colors),
// keyed by the domain template's `themeId`.

// Painted room background per theme — a full-bleed image whose perspective the
// spot frames are tuned against (floor line sits at y ~= 0.73). Drawn behind all
// spots and cover-scaled with the same math as the stage.
export const THEME_BACKGROUND_IMAGES: Record<string, ImageSource> = {
  "studio-dark": require("../../../../assets/studio/studio-background.png"),
};

// Flat fill shown behind the background image (while it loads / at its edges).
export const THEME_BACKGROUNDS: Record<string, string> = {
  "studio-dark": "#241436",
};
