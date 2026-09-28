import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { BonusPage } from "@/features/admin/bonus/BonusPage";
import { IndicacoesPage } from "@/features/admin/indicacoes/IndicacoesPage";
import { InfluencerSaquesPage } from "@/features/admin/influencers/InfluencerSaquesPage";
import { InfluencersPage } from "@/features/admin/influencers/InfluencersPage";
import { InfluencerDashboardPage } from "@/features/influencer/InfluencerDashboardPage";
import { InfluencerLayout } from "@/shared/components/Layout/InfluencerLayout";
import { ConfiguracoesPage } from "@/features/admin/config/ConfiguracoesPage";
import { DashboardPage } from "@/features/admin/dashboard/DashboardPage";
import { JogadoresPage } from "@/features/admin/jogadores/JogadoresPage";
import { RodadasPage } from "@/features/admin/rodadas/RodadasPage";
import { RtpPage } from "@/features/admin/rtp/RtpPage";
import { SaquesPage } from "@/features/admin/saques/SaquesPage";
import { VendasPage } from "@/features/admin/vendas/VendasPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { AdminLayout } from "@/shared/components/Layout/AdminLayout";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

// ponytail: HashRouter pra não precisar de fallback de SPA no serve.mjs
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/vendas" element={<VendasPage />} />
            <Route path="/saques" element={<SaquesPage />} />
            <Route path="/rodadas" element={<RodadasPage />} />
            <Route path="/bonus" element={<BonusPage />} />
            <Route path="/indicacoes" element={<IndicacoesPage />} />
            <Route path="/influencers" element={<InfluencersPage />} />
            <Route path="/influencers/saques" element={<InfluencerSaquesPage />} />
            <Route path="/jogadores" element={<JogadoresPage />} />
            <Route path="/rtp" element={<RtpPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          </Route>
          <Route element={<InfluencerLayout />}>
            <Route path="/influencer" element={<InfluencerDashboardPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
