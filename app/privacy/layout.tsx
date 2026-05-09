import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: "var(--font-geist-mono), 'Courier New', monospace" }}
    >
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
