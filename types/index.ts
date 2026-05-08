export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  subscription_status: "active" | "trialing" | "canceled" | "past_due" | null;
  created_at: string;
};

export type WatchlistItem = {
  id: string;
  user_id: string;
  ticker: string;
  added_at: string;
};

export type Stock = {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number;
  volume: number;
};
