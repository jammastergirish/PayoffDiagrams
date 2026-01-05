
import { PayoffDashboard } from "@/components/payoff-dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-8 dark flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-1 space-y-8">
        <div className="flex flex-col gap-2 border-b border-white/10 pb-6">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-white">
            Payoff <span className="text-orange-500">Visualizer</span>
          </h1>
          <p className="text-lg text-gray-400">
            {/* X */}
          </p>
        </div>
        
        <PayoffDashboard />

      </div>
      <footer className="mt-auto border-t border-white/10 pt-6 pb-4 text-center text-sm text-gray-500">
        Created by{" "}
        <a href="https://www.girish.xyz" className="hover:text-orange-500">
          Girish Gupta
        </a>
      </footer>
    </main>
  );
}
