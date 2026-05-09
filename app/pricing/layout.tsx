import Navbar from "@/components/ui/Navbar";

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
