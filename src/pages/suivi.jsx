import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import logo from "../logo.png";
import html2pdf from 'html2pdf.js';

export default function SuiviPage() {
    const [dossiers, setDossiers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDossier, setSelectedDossier] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // État pour les données de la facture en cours d'édition
    const [invoiceRows, setInvoiceRows] = useState({
        debours: [
            { label: "Droits & taxes C", montant: 19.0 },
            { label: "Droits & taxes UC", montant: 119.0 },
            { label: "Pénalité en douane (dépôt tardif)", montant: 100.0 },
            { label: "Pénalité en douane (Enlèvement tardif)", montant: 300.0 },
            { label: "Frais de visite du conteneur au port", montant: 150.0 },
            { label: "Assurance", montant: 62.42 },
            { label: "Timbres douane", montant: 25.0 }
        ],
        transit: [
            { label: "Honoraires", montant: 250.0 },
            { label: "Formalité déclaration UC", montant: 30.0 },
            { label: "Traitement informatique", montant: 30.0 },
            { label: "Etablissement TCE", montant: 20.0 },
            { label: "Frais fixes", montant: 50.0 }
        ],
        transport: [
            { label: "Frais de transport d'un conteneur 20\"", montant: 280.0 }
        ]
    });
    const [timbre, setTimbre] = useState(1.0);

    useEffect(() => {
        fetchDossiers();
    }, []);
    const filteredClients = dossiers.filter(client => {
        return (
            client.dossiner_no?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const fetchDossiers = async () => {
        setLoading(true);
        try {
            const { data: dossiersData } = await supabase.from("dossiers").select(`*, factures (id, montant_total , data_json)`);
            const { data: clientsData } = await supabase.from("clients").select("*");

            const enriched = dossiersData.map(d => ({
                ...d,
                clientInfo: clientsData.find(c => c.nom_client?.trim().toLowerCase() === d.destinataire?.trim().toLowerCase()) || {},
                dbFactureId: d.factures?.[0]?.id || "---",
                dbMontant: d.factures?.[0]?.montant_total || "0.000"
            }));
            setDossiers(enriched);
        } catch (error) { console.error(error); }
        setLoading(false);
    };

    const handleDelete = async (dossier_no) => {
        if (window.confirm("Voulez-vous vraiment supprimer ce dossier ?")) {
            const { error } = await supabase.from("dossiers").delete().eq("dossier_no", dossier_no);
            if (error) alert("Erreur lors de la suppression");
            else { alert("Dossier supprimé !"); fetchDossiers(); }
        }
    };

    // Calculs de la facture
    const debTotal = invoiceRows.debours.reduce((sum, r) => sum + r.montant, 0);
    const taxTotaldossier = invoiceRows.transit.reduce((sum, r) => sum + r.montant, 0);
    const transportSubTotal = invoiceRows.transport.reduce((sum, r) => sum + r.montant, 0);
    const taxTotal = taxTotaldossier + transportSubTotal;
    const tva = taxTotaldossier * 0.19;
    const tva7 = transportSubTotal * 0.07;
    const totalFinal = debTotal + taxTotal + tva + timbre + tva7;

    const handleDownload = async () => {
        const factureId = selectedDossier.dbFactureId;

        if (!factureId) {
            alert("Facture non encore enregistrée");
            return;
        }

        const response = await fetch(
            `http://localhost:5000/facture/${factureId}`
        );

        if (!response.ok) {
            alert("Erreur lors du téléchargement");
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `facture_${selectedDossier.factures?.[0]?.data_json?.facture?.numero}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(url);
    };



    const getNextInvoiceNumber = async () => {
        const year = new Date().getFullYear().toString().slice(-2);

        const { data, error } = await supabase
            .from("factures")
            .select("data_json")
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Filtrer uniquement les factures de l'année courante
        const currentYearInvoices = data.filter(f =>
            f?.data_json?.facture?.numero?.endsWith(`/${year}`)
        );

        if (currentYearInvoices.length === 0) {
            return `001/${year}`;
        }

        const lastNumber = currentYearInvoices[0].data_json.facture.numero;
        const lastIndex = parseInt(lastNumber.split("/")[0], 10);

        return `${String(lastIndex + 1).padStart(3, "0")}/${year}`;
    };


    const handleValidateInvoice = async () => {
        try {
            const nextInvoiceNumber = await getNextInvoiceNumber();

            const dataJson = {
                facture: {
                    numero: nextInvoiceNumber,
                    date: new Date().toISOString(),
                    dossier_no: selectedDossier.dossier_no,
                    navire: selectedDossier.navire || "",
                    date_arrivee: "",
                    conteneur: selectedDossier.ctu_lta?.split('"')[0] || "",
                    marque: selectedDossier.ctu_lta?.includes('"')
                        ? selectedDossier.ctu_lta.split('"').slice(1).join('"')
                        : "",
                    declaration_c: selectedDossier.declaration_no || "",
                    declaration_uc: "",
                    escale: selectedDossier.escale || "",
                    rubrique: selectedDossier.rubrique || "",
                    colisage: selectedDossier.colisage || "",
                    poids_brut: selectedDossier.pb || "",
                    valeur_douane: ""
                },

                client: {
                    code_client: selectedDossier.clientInfo?.code_client || "",
                    nom: selectedDossier.destinataire || "",
                    adresse: selectedDossier.clientInfo?.adresse || "",
                    code_tva: selectedDossier.clientInfo?.code_tva || ""
                },

                lignes: {
                    debours: invoiceRows.debours,
                    transit: invoiceRows.transit,
                    transport: invoiceRows.transport
                },

                totaux: {
                    total_non_taxable: debTotal,
                    total_taxable: taxTotal,
                    tva_7: tva7,
                    tva_19: tva,
                    timbre: timbre,
                    total_final: totalFinal
                }
            };

            const { error } = await supabase
                .from("factures")
                .insert([{
                    dossier_no: selectedDossier.dossier_no,
                    montant_total: totalFinal,
                    data_json: dataJson
                }]);

            if (error) throw error;
            setSelectedDossier(prev => ({
                ...prev,
                dbFactureId: nextInvoiceNumber
            }));

            alert("✅ Facture enregistrée avec tous les champs !");
            fetchDossiers();
            setSelectedDossier(null);

        } catch (error) {
            console.error(error);
            alert("❌ Erreur : " + error.message);
        }


    };

    return (
        <div className="flex h-screen bg-zinc-100 font-sans text-black">
            <style>{`
                .invoice-page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 0 auto; background: white; box-sizing: border-box; display: flex; flex-direction: column; position: relative; box-shadow: 0 0 20px rgba(0,0,0,0.2); }
                .invoice-header { display: flex; justify-content: space-between; margin-bottom: 25px; }
                .logo-img { max-width: 250px; height: auto; }
                .client-box { width: 280px; font-size: 12px; line-height: 1.4; border: 1px solid #eee; padding: 8px; text-align: left; }
                .info-container { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 20px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 10px 0; }
                .info-col { width: 48%; text-align: left; }
                .info-row { display: flex; margin-bottom: 2px; }
                .info-label { width: 130px; font-weight: bold; }
                .info-value { flex: 1; border: none; outline: none; font-size: 11px; background: transparent; }
                .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                .invoice-table th { text-align: left; font-size: 12px; border-bottom: 1px solid #000; padding: 8px; }
                .invoice-table td { padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #f9f9f9; }
                .section-header { font-weight: bold; text-decoration: underline; background: #f2f2f2; padding: 10px 8px; text-align: left; }
                .amount-col { text-align: right; width: 130px; }
                .editable-input { border: none; width: 90%; background: transparent; outline: none; }
                .num-input { border: none; text-align: right; width: 100%; outline: none; font-family: monospace; font-size: 13px; background: transparent; }
                .totals-wrapper { display: flex; justify-content: flex-end; margin-top: 10px; }
                .totals-table { width: 280px; }
                .totals-table td { border: none; padding: 3px 8px; font-size: 13px; }
                .total-final { font-weight: bold; font-size: 15px; border-top: 2px solid #000 !important; }
                .total-phrase-row { margin-top: auto; padding: 15px 0; font-size: 13px; border-top: 1px solid #000; text-align: left; }
                .invoice-footer { display: flex; justify-content: space-between; font-size: 10px; padding-top: 5px; text-align: left; }
                .btn-add { font-size: 10px; margin-left: 10px; cursor: pointer; background: #eee; border: 1px solid #ccc; padding: 2px 5px; border-radius: 3px; color: black; }
                .btn-del { color: red; cursor: pointer; font-weight: bold; margin-right: 5px; }
                @media print { 
                    .no-print { display: none !important; } 
                    body { background: white; }
                    .invoice-page { box-shadow: none; margin: 0; width: 100%; }
                }
            `}</style>

            <aside className="w-64 bg-black text-white flex flex-col">

                <div className="p-8 mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-60 h-20 bg-white rounded-xl flex items-center justify-center overflow-hidden p-2 shadow-sm">
                            <img
                                src={logo}
                                alt="Logo"
                                className="w-full h-full object-contain"
                            />
                        </div>


                    </div>
                </div>
                <nav className="flex-1 px-4 space-y-2">

                    <NavItem label="Dashboard" to="/dashboard" />
                    <NavItem label="Création d'un dossier" to="/creation-dossier" />
                    <NavItem label="Suivi des dossiers" to="/suivi" active />
                    <NavItem label="Clients" to="/" />
                </nav>
            </aside >

            <main className="flex-1 flex flex-col overflow-hidden no-print">

                <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 justify-between">
                    <h1 className="text-xl font-bold">Suivi & Facturation</h1>
                </header>

                <div className="p-6 overflow-auto">
                    <div className="flex gap-4 mb-8">
                        <input
                            type="text"
                            placeholder="Rechercher par dossier"
                            className="flex-1 bg-zinc-50 border-none rounded-xl px-5 py-3 text-sm focus:ring-1 focus:ring-black outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <table className="w-full bg-white rounded-xl shadow-sm overflow-hidden text-left">
                        <thead>
                            <tr className="bg-zinc-50 border-b text-[11px] uppercase text-zinc-500">
                                <th className="px-6 py-4">Dossier</th>
                                <th className="px-6 py-4">Destinataire</th>
                                <th className="px-6 py-4">Facture N°</th>
                                <th className="px-6 py-4">Montant facture</th>
                                <th className="px-6 py-4">Actions</th>
                                <th className="px-6 py-4 text-right">Facture</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {dossiers.map((d) => (
                                <tr key={d.dossier_no} className="hover:bg-zinc-50">
                                    <td className="px-6 py-4 font-bold text-red-600">{d.dossier_no}</td>
                                    <td className="px-6 py-4">{d.destinataire}</td>
                                    <td className="px-6 py-4">{d.factures?.[0]?.data_json?.facture?.numero || "—"}</td>
                                    <td className="px-6 py-4 font-mono">{Number(d.dbMontant).toFixed(3)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => { }} className="text-blue-600 hover:text-blue-800 font-medium text-[11px] uppercase">Modifier</button>
                                            <button onClick={() => handleDelete(d.dossier_no)} className="text-red-500 hover:text-red-700 font-medium text-[11px] uppercase">Supprimer</button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => setSelectedDossier(d)} className="bg-zinc-900 text-white text-[10px] font-bold uppercase px-4 py-2 rounded">Ouvrir Facture</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            {selectedDossier && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center overflow-y-auto py-10 no-print">
                    <div className="relative">
                        {/* Boutons de contrôle */}
                        <div className="absolute -left-24 top-0 flex flex-col gap-4 no-print">
                            <button onClick={() => setSelectedDossier(null)} className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-gray-100">✕</button>
                            <button onClick={handleDownload} className="w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-blue-700">📥</button>
                            <button onClick={handleValidateInvoice} className="w-12 h-12 bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-green-700" title="Valider et Enregistrer">✅</button>
                        </div>

                        {/* Zone PDF */}
                        <div id="invoice-content" className="invoice-page">
                            <div className="invoice-header">
                                <div className="logo"><img src={logo} alt="Logo" className="logo-img" /></div>
                                <div className="client-box">
                                    Code client : {selectedDossier.clientInfo?.code_client || "---"}<br />
                                    <strong>Client : {selectedDossier.destinataire}</strong><br />
                                    Adresse : {selectedDossier.clientInfo?.adresse || "---"}<br />
                                    Code TVA : {selectedDossier.clientInfo?.code_tva || "---"}
                                </div>
                            </div>

                            <div className="info-container">
                                <div className="info-col">
                                    <div className="info-row"><span className="info-label">Facture n° :</span><input className="info-value" defaultValue={`${selectedDossier.factures?.[0]?.data_json?.facture?.numero || "—"}`} /></div>
                                    <div className="info-row"><span className="info-label">Date Facture :</span><input className="info-value" defaultValue={new Date().toLocaleDateString('fr-FR')} /></div>
                                    <div className="info-row"><span className="info-label">Dossier import n° :</span><input className="info-value" defaultValue={selectedDossier.dossier_no} /></div>
                                    <div className="info-row"><span className="info-label">Navire :</span><input className="info-value" defaultValue={selectedDossier.navire || ""} /></div>
                                    <div className="info-row"><span className="info-label">Date d'arrivée :</span><input className="info-value" defaultValue={""} /></div>
                                    <div className="info-row">
                                        <span className="info-label">Conteneur :</span>
                                        <input className="info-value" defaultValue={selectedDossier.ctu_lta?.split('"')[0] + (selectedDossier.ctu_lta?.includes('"') ? '"' : '')} />
                                    </div>                                    <div className="info-row">
                                        <span className="info-label">Marque :</span>
                                        <input className="info-value" defaultValue={selectedDossier.ctu_lta?.includes('"') ? selectedDossier.ctu_lta.split('"').slice(1).join('"') : " "} />
                                    </div>                                </div>
                                <div className="info-col">
                                    <div className="info-row"><span className="info-label">Déclaration C n° :</span><input className="info-value" defaultValue={selectedDossier.declaration_no || ""} /></div>
                                    <div className="info-row"><span className="info-label">Déclaration UC n° :</span><input className="info-value" defaultValue={""} /></div>
                                    <div className="info-row"><span className="info-label">Escale n° :</span><input className="info-value" defaultValue={selectedDossier.escale || ""} /></div>
                                    <div className="info-row"><span className="info-label">Rubrique :</span><input className="info-value" defaultValue={selectedDossier.rubrique || ""} /></div>
                                    <div className="info-row"><span className="info-label">Colisage :</span><input className="info-value" defaultValue={selectedDossier.colisage || ""} /></div>
                                    <div className="info-row"><span className="info-label">Poids Brut :</span><input className="info-value" defaultValue={selectedDossier.pb || ""} /></div>
                                    <div className="info-row"><span className="info-label">Valeur Douane:</span><input className="info-value" defaultValue={""} /></div>

                                </div>
                            </div>

                            <InvoiceTable
                                rows={invoiceRows}
                                setRows={setInvoiceRows}
                                timbre={timbre}
                                setTimbre={setTimbre}
                                totals={{ debTotal, taxTotal, tva, tva7, totalFinal }}
                            />

                            <div className="invoice-footer">
                                <div>
                                    <div className="font-bold">EDEN TRANSPORT INTERNATIONAL<br />
                                        Transport multimodal - Groupage - Transit </div>
                                    <div className="font-semibold">Code TVA : 763530P/A/M/000<br />
                                        R.C : B130912001</div>
                                </div>
                                <div className="text-right">
                                    19 bis, Av. Habib Bourguiba - 2033 Megrine <br />
                                    Tél. : (+216) 71 42 89 15 - 71 42 76 76<br />
                                    Fax : (+216) 71 42 85 07<br />
                                    Email : eden.tir@planet.tn
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function InvoiceTable({ rows, setRows, timbre, setTimbre, totals }) {
    const updateValue = (section, index, field, value) => {
        const newRows = { ...rows };
        newRows[section][index][field] = field === 'montant' ? parseFloat(value || 0) : value;
        setRows(newRows);
    };

    const addRow = (section) => {
        setRows({ ...rows, [section]: [...rows[section], { label: `Nouvelle prestation...`, montant: 0 }] });
    };

    const removeRow = (section, index) => {
        const newRows = { ...rows };
        newRows[section].splice(index, 1);
        setRows(newRows);
    };

    return (
        <>
            <table className="invoice-table">
                <tbody>
                    <tr className="section-header"><td colSpan="2">DEBOURS <button className="btn-add no-print" onClick={() => addRow('debours')}>+ Ajouter</button></td></tr>
                    {rows.debours.map((r, i) => (
                        <tr key={i}>
                            <td><span className="btn-del no-print" onClick={() => removeRow('debours', i)}>×</span><input className="editable-input" value={r.label} onChange={(e) => updateValue('debours', i, 'label', e.target.value)} /></td>
                            <td className="amount-col"><input type="number" step="0.001" className="num-input" value={r.montant.toFixed(3)} onChange={(e) => updateValue('debours', i, 'montant', e.target.value)} /></td>
                        </tr>
                    ))}
                    <tr className="section-header"><td colSpan="2">TRANSIT <button className="btn-add no-print" onClick={() => addRow('transit')}>+ Ajouter</button></td></tr>
                    {rows.transit.map((r, i) => (
                        <tr key={i}>
                            <td><span className="btn-del no-print" onClick={() => removeRow('transit', i)}>×</span><input className="editable-input" value={r.label} onChange={(e) => updateValue('transit', i, 'label', e.target.value)} /></td>
                            <td className="amount-col"><input type="number" step="0.001" className="num-input" value={r.montant.toFixed(3)} onChange={(e) => updateValue('transit', i, 'montant', e.target.value)} /></td>
                        </tr>
                    ))}
                    <tr className="section-header"><td colSpan="2">TRANSPORT <button className="btn-add no-print" onClick={() => addRow('transport')}>+ Ajouter</button></td></tr>
                    {rows.transport.map((r, i) => (
                        <tr key={i}>
                            <td><span className="btn-del no-print" onClick={() => removeRow('transport', i)}>×</span><input className="editable-input" value={r.label} onChange={(e) => updateValue('transport', i, 'label', e.target.value)} /></td>
                            <td className="amount-col"><input type="number" step="0.001" className="num-input" value={r.montant.toFixed(3)} onChange={(e) => updateValue('transport', i, 'montant', e.target.value)} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="totals-wrapper">
                <table className="totals-table">
                    <tbody>
                        <tr><td>Total non Taxable :</td><td className="amount-col">{totals.debTotal.toFixed(3)}</td></tr>
                        <tr><td>Total Taxables :</td><td className="amount-col">{totals.taxTotal.toFixed(3)}</td></tr>
                        <tr><td>TVA 7% :</td><td className="amount-col">{totals.tva7.toFixed(3)}</td></tr>
                        <tr><td>TVA 19% :</td><td className="amount-col">{totals.tva.toFixed(3)}</td></tr>
                        <tr><td>Timbre Fiscal :</td><td className="amount-col"><input type="number" step="0.001" className="num-input" value={timbre.toFixed(3)} onChange={(e) => setTimbre(parseFloat(e.target.value || 0))} /></td></tr>
                        <tr className="total-final"><td>Total Facture en TND</td><td className="amount-col">{totals.totalFinal.toFixed(3)}</td></tr>
                    </tbody>
                </table>
            </div>

            <div className="total-phrase-row">
                <strong>Total en votre aimable règlement : </strong>
                <span className="italic">{Math.floor(totals.totalFinal)} Dinars, {Math.round((totals.totalFinal % 1) * 1000)} millimes</span>
            </div>
        </>
    );
}

function NavItem({ label, active = false, to = "/" }) {
    return (
        <Link to={to} className="block no-underline">
            <div className={`px-4 py-3 rounded-xl cursor-pointer text-sm font-medium transition ${active ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-white hover:bg-zinc-900"}`}>
                {label}
            </div>
        </Link>
    );
}