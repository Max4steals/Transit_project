import { BrowserRouter, Routes, Route } from "react-router-dom"
import Client from "./pages/Client"
import CreationDossier from "./pages/CreationDossier"
import SuiviPage from "./pages/Archive"
import Dashboard from "./pages/dashboard"
import ModifierDossier from "./pages/ModifierDossier";
import FacturePage from "./pages/FactureDetails";
import ModFacture from "./pages/ModifierFacture";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Client />} />
        <Route path="/creation-dossier" element={<CreationDossier />} />
        <Route path="/archive" element={<SuiviPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/modifier-dossier/:dossier_no" element={<ModifierDossier />} />
        <Route path="/modfacture/:dossier_no" element={<ModFacture />} />
        <Route path="/facture/:dossier_no" element={<FacturePage />} />

      </Routes>
    </BrowserRouter>
  )
}
