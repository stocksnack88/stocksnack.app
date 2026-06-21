import { supabaseAdmin } from "@/lib/supabase";

interface BlogImageParams {
  title: string;
  category: string;
  ticker?: string;
  stat?: string;
  statLabel?: string;
}

function buildSvg({ title, category, ticker, stat, statLabel }: BlogImageParams): string {
  const lines = splitTitle(title, 38);
  const line1 = escapeXml(lines[0] ?? "");
  const line2 = escapeXml(lines[1] ?? "");
  const hasStat = stat && statLabel;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#001400"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Green left accent bar -->
  <rect x="0" y="0" width="6" height="630" fill="#00ff41"/>

  <!-- Grid lines (subtle) -->
  <line x1="80" y1="0" x2="80" y2="630" stroke="rgba(0,255,65,0.04)" stroke-width="1"/>
  <line x1="0" y1="560" x2="1200" y2="560" stroke="rgba(0,255,65,0.06)" stroke-width="1"/>

  <!-- STOCKSNACK watermark -->
  <text x="80" y="70" font-family="monospace" font-size="13" font-weight="700" letter-spacing="6" fill="rgba(0,255,65,0.12)">STOCKSNACK</text>

  <!-- Category label -->
  <rect x="80" y="100" width="${category.length * 8 + 24}" height="26" rx="3" fill="rgba(0,255,65,0.08)" stroke="rgba(0,255,65,0.25)" stroke-width="1"/>
  <text x="92" y="118" font-family="monospace" font-size="11" font-weight="700" letter-spacing="3" fill="#00ff41">${escapeXml(category.toUpperCase())}</text>

  ${ticker ? `<!-- Ticker badge -->
  <rect x="${80 + category.length * 8 + 40}" y="100" width="${ticker.length * 10 + 20}" height="26" rx="3" fill="rgba(0,255,65,0.05)" stroke="rgba(0,255,65,0.15)" stroke-width="1"/>
  <text x="${80 + category.length * 8 + 50}" y="118" font-family="monospace" font-size="11" font-weight="700" letter-spacing="2" fill="rgba(0,255,65,0.6)">$${escapeXml(ticker)}</text>` : ""}

  <!-- Title line 1 -->
  <text x="80" y="${line2 ? "230" : "270"}" font-family="monospace" font-size="52" font-weight="700" fill="#00ff41" letter-spacing="-1">${line1}</text>
  ${line2 ? `<!-- Title line 2 -->
  <text x="80" y="295" font-family="monospace" font-size="52" font-weight="700" fill="#00ff41" letter-spacing="-1">${line2}</text>` : ""}

  ${hasStat ? `<!-- Stat box -->
  <rect x="80" y="360" width="340" height="90" rx="4" fill="rgba(0,255,65,0.05)" stroke="rgba(0,255,65,0.2)" stroke-width="1"/>
  <text x="100" y="400" font-family="monospace" font-size="36" font-weight="700" fill="#00ff41">${escapeXml(stat!)}</text>
  <text x="100" y="430" font-family="monospace" font-size="12" letter-spacing="3" fill="rgba(0,255,65,0.5)">${escapeXml(statLabel!.toUpperCase())}</text>` : ""}

  <!-- Bottom footer -->
  <text x="80" y="598" font-family="monospace" font-size="12" letter-spacing="4" fill="rgba(0,255,65,0.3)">stocksnack.app · STOCK ANALYSIS</text>
  <text x="1120" y="598" font-family="monospace" font-size="12" letter-spacing="2" fill="rgba(0,255,65,0.2)" text-anchor="end">2025</text>
</svg>`;
}

function splitTitle(title: string, maxChars: number): string[] {
  if (title.length <= maxChars) return [title];
  const words = title.split(" ");
  const line1: string[] = [];
  for (const word of words) {
    if ((line1.join(" ") + " " + word).trim().length <= maxChars) {
      line1.push(word);
    } else {
      break;
    }
  }
  const line2 = words.slice(line1.length).join(" ");
  return [line1.join(" "), line2];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateBlogImage(
  slug: string,
  params: BlogImageParams
): Promise<string | null> {
  try {
    const svg = buildSvg(params);
    const buffer = Buffer.from(svg, "utf8");
    const path = `${slug}.svg`;

    const { error } = await supabaseAdmin.storage
      .from("blog-images")
      .upload(path, buffer, {
        contentType: "image/svg+xml",
        upsert: true,
      });

    if (error) {
      console.error("Storage upload error:", error.message);
      return null;
    }

    const { data } = supabaseAdmin.storage.from("blog-images").getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error("generateBlogImage error:", err);
    return null;
  }
}
