import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import TrialManager from "@/components/TrialManager";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col">{children}</div>
      <Footer />
      <TrialManager />
    </div>
  );
}
