import { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Blog | StockSnack",
  description: "Stock analysis, scoring breakdowns, and investing insights from the StockSnack team.",
  openGraph: {
    title: "Blog | StockSnack",
    description: "Stock analysis, scoring breakdowns, and investing insights from the StockSnack team.",
    url: "https://stocksnack.app/blog",
    siteName: "StockSnack",
    images: [{ url: "https://stocksnack.app/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
};

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

export const revalidate = 60;

export default async function BlogIndexPage() {
  const { data: posts } = await supabaseAdmin
    .from("blog_posts")
    .select("slug, title, excerpt, category, ticker, featured_image_url, published_at, author")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    <main className="px-6 py-12 max-w-5xl mx-auto" style={mono}>
      <div className="mb-10">
        <p className="text-xs tracking-widest mb-2" style={{ color: "rgba(0,255,65,0.4)" }}>
          STOCKSNACK
        </p>
        <h1 className="text-2xl font-bold tracking-widest mb-3" style={{ color: "#00ff41" }}>
          BLOG
        </h1>
        <p className="text-xs leading-relaxed max-w-lg" style={{ color: "rgba(0,255,65,0.5)" }}>
          Stock analysis, scoring breakdowns, and investing insights.
        </p>
      </div>

      {(!posts || posts.length === 0) ? (
        <p className="text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>No posts yet — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block rounded overflow-hidden transition-colors group"
              style={{ border: "1px solid rgba(0,255,65,0.15)", background: "rgba(0,255,65,0.02)" }}
            >
              {post.featured_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.featured_image_url}
                  alt={post.title}
                  width={600}
                  height={315}
                  className="w-full object-cover"
                  style={{ aspectRatio: "1200/630", maxHeight: "200px" }}
                />
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
                    style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.2)", color: "#00ff41" }}
                  >
                    {post.category.toUpperCase()}
                  </span>
                  {post.ticker && (
                    <span className="text-[10px] tracking-wider" style={{ color: "rgba(0,255,65,0.4)" }}>
                      ${post.ticker}
                    </span>
                  )}
                </div>
                <h2
                  className="text-sm font-bold leading-snug mb-2 tracking-wide group-hover:text-[#00ff41] transition-colors"
                  style={{ color: "rgba(0,255,65,0.9)" }}
                >
                  {post.title}
                </h2>
                <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(0,255,65,0.4)" }}>
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-widest" style={{ color: "rgba(0,255,65,0.3)" }}>
                    {post.author}
                  </span>
                  {post.published_at && (
                    <span className="text-[10px]" style={{ color: "rgba(0,255,65,0.25)" }}>
                      {new Date(post.published_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
