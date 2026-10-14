// Generates the brand assets with next/og (same renderer Next uses for metadata images):
//   src/app/favicon.ico (16/32/48 px), src/app/icon.png (192), src/app/apple-icon.png (180),
//   src/app/opengraph-image.png (1200x630) + .alt.txt
// Run from /web:  pnpm brand:assets
// Fonts (OFL, Google Fonts) are fetched at generation time only; nothing is downloaded at build or run time.
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";

const INK = "#0a090c", INK2 = "#131118", PAPER = "#f5f3f7", MUTE = "#a39fae", VOLT = "#9d6bff", VOLT2 = "#c3a6ff";

async function googleFont(family: string, weight: number): Promise<ArrayBuffer> {
  // An old user agent makes the Google Fonts CSS API answer with plain TTF URLs (what the renderer needs).
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" },
  })).text();
  // The CSS lists one @font-face per unicode subset; take the basic "latin" one.
  const url = css.split("/* latin */")[1]?.match(/src: url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error(`No TTF for ${family} ${weight}`);
  return (await fetch(url)).arrayBuffer();
}

async function main() {
const [logoFont, displayFont, bodyFont] = await Promise.all([
  googleFont("Sedgwick Ave Display", 400),
  googleFont("Bricolage Grotesque", 800),
  googleFont("Bricolage Grotesque", 500),
]);
const fonts = [
  { name: "Logo", data: logoFont, weight: 400 as const },
  { name: "Display", data: displayFont, weight: 800 as const },
  { name: "Display", data: bodyFont, weight: 500 as const },
];

const png = async (el: React.ReactElement, width: number, height: number) =>
  Buffer.from(await new ImageResponse(el, { width, height, fonts }).arrayBuffer());

/** The mark: hand-lettered "N" plus the violet full stop of the wordmark, on a dark squircle. */
function Mark({ size }: { size: number }) {
  const small = size <= 48;
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: INK, borderRadius: size * 0.22, position: "relative" }}>
      <div style={{ fontFamily: "Logo", fontSize: size * (small ? 0.86 : 0.74), color: PAPER, transform: "rotate(-4deg)", marginTop: -size * 0.06, marginLeft: -size * 0.08, display: "flex" }}>N</div>
      <div style={{ position: "absolute", width: size * 0.2, height: size * 0.2, borderRadius: 999, background: VOLT, right: size * 0.14, bottom: size * 0.16 }} />
    </div>
  );
}

/** Minimal ICO container holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const out = new URL("../src/app/", import.meta.url);
const icons = await Promise.all([16, 32, 48].map(async (s) => ({ size: s, data: await png(<Mark size={s} />, s, s) })));
writeFileSync(new URL("favicon.ico", out), ico(icons));
writeFileSync(new URL("icon.png", out), await png(<Mark size={192} />, 192, 192));
writeFileSync(new URL("apple-icon.png", out), await png(<Mark size={180} />, 180, 180));

// Share card: wordmark, the promise, and the line of dots with a few picked (the product in one picture).
const dots = Array.from({ length: 16 }, (_, i) => [2, 6, 10, 13].includes(i));
writeFileSync(new URL("opengraph-image.png", out), await png(
  <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: INK, backgroundImage: `radial-gradient(ellipse 900px 520px at 50% -10%, rgba(157,107,255,0.35), ${INK} 70%)`, color: PAPER, fontFamily: "Display" }}>
    <div style={{ display: "flex", alignItems: "baseline" }}>
      <div style={{ fontFamily: "Logo", fontSize: 92, transform: "rotate(-3deg)", display: "flex" }}>Next<span style={{ color: VOLT }}>.</span></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>
        <span>Everyone in line.&nbsp;</span><span style={{ color: VOLT }}>Nobody cuts in.</span>
      </div>
      <div style={{ marginTop: 22, fontSize: 32, fontWeight: 500, color: MUTE, display: "flex" }}>Fair draws for seats, scholarships and anything in short supply.</div>
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 12, padding: "16px 20px", background: INK2, borderRadius: 999 }}>
        {dots.map((on, i) => <div key={i} style={{ width: 22, height: 22, borderRadius: 999, background: on ? VOLT : "#2a2633", boxShadow: on ? `0 0 18px ${VOLT}` : "none" }} />)}
      </div>
      <div style={{ fontSize: 26, fontWeight: 500, color: VOLT2, display: "flex" }}>Join any time. A fair draw picks.</div>
    </div>
  </div>,
  1200, 630,
));
writeFileSync(new URL("opengraph-image.alt.txt", out), "Next: Everyone in line. Nobody cuts in. Fair draws for seats, scholarships and anything in short supply.\n");
console.log("Wrote favicon.ico, icon.png, apple-icon.png, opengraph-image.png");
}

main().catch((e) => { console.error(e); process.exit(1); });
