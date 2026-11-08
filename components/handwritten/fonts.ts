import { Architects_Daughter, Caveat, Kalam, Nanum_Pen_Script } from "next/font/google";
import localFont from "next/font/local";

// The five hands (lib/handwritten/themes.ts names them by these variables).
// Loaded only on the handwritten page, so the rest of the site stays as light.
// Caveat is also the site's pen, but that one is bold only; the paper needs
// a regular weight for answers too.

const caveat = Caveat({ variable: "--hand-caveat", weight: ["500", "700"], subsets: ["latin"] });
const kalam = Kalam({ variable: "--hand-kalam", weight: ["400", "700"], subsets: ["latin"] });
const architect = Architects_Daughter({ variable: "--hand-architect", weight: "400", subsets: ["latin"] });
const nanum = Nanum_Pen_Script({ variable: "--hand-nanum", weight: "400", subsets: ["latin"] });
// Excalidraw's hand, as in docs/diagrams (not on Google Fonts): its Latin
// part, kept in the repo with its licence (fonts/OFL.txt). One weight only.
const excalifont = localFont({
  variable: "--hand-excalifont",
  src: "./fonts/Excalifont-Regular-latin.woff2",
  weight: "400",
});

/** Put on the page's root so every hand's variable is defined inside it. */
export const handFontVariables = [caveat, kalam, architect, nanum, excalifont].map((f) => f.variable).join(" ");
