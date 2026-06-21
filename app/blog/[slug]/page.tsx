import { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { supabaseAdmin } from "@/lib/supabase";

export const revalidate = 60;

const mono = { fontFamily: "var(--font-geist-mono), 'Courier New', monospace" };

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const { data: post } = await supabaseAdmin
    .from("blog_posts")
    .select("title, excerpt, seo_title, seo_description, featured_image_url, published_at, author")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  if (!post) return { title: "Post Not Found | StockSnack" };

  const title = post.seo_title ?? `${post.title} | StockSnack`;
  const description = post.seo_description ?? post.excerpt;
  const ogImage = post.featured_image_url ?? "https://stocksnack.app/og-image.png";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://stocksnack.app/blog/${params.slug}`,
      siteName: "StockSnack",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
      publishedTime: post.published_at ?? undefined,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const { data: post } = await supabaseAdmin
    .from("blog_posts")
    .select("*")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  if (!post) return notFound();

  const htmlContent = await marked(post.content, { async: true });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.featured_image_url ?? "https://stocksnack.app/og-image.png",
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "StockSnack",
      url: "https://stocksnack.app",
    },
    datePublished: post.published_at,
    dateModified: post.published_at,
    url: `https://stocksnack.app/blog/${post.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main style={mono}>
        {post.featured_image_url && (
          <div className="w-full" style={{ maxHeight: "420px", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.featured_image_url}
              alt={post.title}
              width={1200}
              height={630}
              className="w-full object-cover"
              style={{ maxHeight: "420px" }}
            />
          </div>
        )}

        <div className="px-6 py-10 max-w-3xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
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

            <h1 className="text-xl font-bold leading-snug tracking-wide mb-4" style={{ color: "#00ff41" }}>
              {post.title}
            </h1>

            <div className="flex items-center gap-4 pb-4" style={{ borderBottom: "1px solid rgba(0,255,65,0.1)" }}>
              <span className="text-xs font-bold tracking-widest" style={{ color: "rgba(0,255,65,0.6)" }}>
                {post.author}
              </span>
              {post.published_at && (
                <span className="text-xs" style={{ color: "rgba(0,255,65,0.3)" }}>
                  {new Date(post.published_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>

          <div
            className="blog-prose"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          <div className="mt-12 pt-6" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
            <a
              href="/blog"
              className="text-xs tracking-widest transition-colors"
              style={{ color: "rgba(0,255,65,0.4)" }}
            >
              ← BACK TO BLOG
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
