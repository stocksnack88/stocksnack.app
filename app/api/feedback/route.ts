import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB, matches the storage bucket's own limit
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif":  "gif",
};

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const message  = form.get("message");
  const email    = form.get("email");
  const page_url = form.get("page_url");
  const image    = form.get("image");

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Try to pull user_id and email from the session (optional — works for anon too)
  let userId: string | null = null;
  let sessionEmail: string | null = null;
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    sessionEmail = user?.email ?? null;
  } catch {
    // non-fatal — submit without user context
  }

  let image_url: string | null = null;
  if (image instanceof File && image.size > 0) {
    const ext = ALLOWED_IMAGE_TYPES[image.type];
    if (!ext) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 5MB)" }, { status: 400 });
    }
    const path = `${userId ?? "anon"}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await image.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("feedback-images")
      .upload(path, buffer, { contentType: image.type, upsert: false });

    if (uploadErr) {
      console.error("[feedback] image upload error:", uploadErr.message);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }
    image_url = supabaseAdmin.storage.from("feedback-images").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabaseAdmin.from("feedback").insert({
    user_id:  userId,
    email:    (typeof email === "string" && email.trim()) || sessionEmail || null,
    message:  message.trim(),
    page_url: typeof page_url === "string" ? page_url : null,
    image_url,
    status:   "new",
  });

  if (error) {
    console.error("[feedback] insert error:", error.message);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
