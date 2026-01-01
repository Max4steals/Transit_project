from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from pypdf import PdfReader, PdfWriter
from num2words import num2words
import io
import os

def montant_en_lettres(montant):
    entier = int(montant)
    millimes = int(round((montant - entier) * 1000))

    texte_entier = num2words(entier, lang='fr').capitalize()

    if millimes > 0:
        texte_millimes = num2words(millimes, lang='fr')
        return f"{texte_entier} dinars et {texte_millimes} millimes"

    return f"{texte_entier} dinars"


def generer_facture_eden_dynamique(fichier_entete, data):
    # ===== 1. PDF DYNAMIQUE EN MÉMOIRE =====
    overlay_buffer = io.BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=A4)
    width, height = A4

    # --- BLOC CLIENT ---
    c.setFont("Helvetica", 9)
    y_client = 255 * mm
    client = data["client"]

    c.drawRightString(185*mm, y_client, f"Code client {client['code_client']}")
    c.drawRightString(185*mm, y_client - 5*mm, f"Client : {client['nom']}")
    c.drawRightString(185*mm, y_client - 10*mm, f"Adresse : {client['adresse']}")
    c.drawRightString(185*mm, y_client - 15*mm, f"Code TVA : {client['code_tva']}")

    # --- INFOS DOSSIER ---
    y_info = 218 * mm
    f = data["facture"]

    c.setFont("Helvetica-Bold", 8.5)
    labels_gauche = [
        "Facture n° :", "Date Facture :", "Dossier import n° :",
        "Navire :", "Date d'arrivée :", "Conteneur :"
    ]

    for i, label in enumerate(labels_gauche):
        c.drawString(25*mm, y_info - i*4.5*mm, label)

    c.setFont("Helvetica", 8.5)
    values_gauche = [
        f["numero"], f["date"][:10], f["dossier_no"],
        f["navire"], f["date_arrivee"], f["conteneur"]
    ]

    for i, val in enumerate(values_gauche):
        c.drawString(60*mm, y_info - i*4.5*mm, str(val))

    # --- COLONNE DROITE ---
    c.setFont("Helvetica-Bold", 8.5)
    labels_droite = [
        "Déclaration C n° :", "Déclaration UC n° :", "Escale n° :",
        "Rubrique :", "Colisage :", "Poids Brut :"
    ]

    for i, label in enumerate(labels_droite):
        c.drawString(115*mm, y_info - i*4.5*mm, label)

    c.setFont("Helvetica", 8.5)
    values_droite = [
        f["declaration_c"], f["declaration_uc"], f["escale"],
        f["rubrique"], f["colisage"], f["poids_brut"]
    ]

    for i, val in enumerate(values_droite):
        c.drawString(155*mm, y_info - i*4.5*mm, str(val))

    # --- SECTIONS DYNAMIQUES ---
    def draw_section(title, items, y_start):
        if not items:
            return y_start

        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(25*mm, y_start, title)
        c.line(25*mm, y_start - 1*mm, 45*mm, y_start - 1*mm)

        y = y_start - 6*mm
        c.setFont("Helvetica", 9)

        for item in items:
            c.drawString(25*mm, y, item["label"])
            c.drawRightString(185*mm, y, f"{item['montant']:.3f}")
            y -= 4.5*mm

        return y - 3*mm

    y_current = 182 * mm
    y_current = draw_section("DEBOURS", data["lignes"]["debours"], y_current)
    y_current = draw_section("TRANSIT", data["lignes"]["transit"], y_current)
    y_current = draw_section("TRANSPORT", data["lignes"]["transport"], y_current)

    # --- TOTAUX ---
    t = data["totaux"]
    y_tot = y_current - 10*mm

    c.setFont("Helvetica", 9.5)
    for label, value in [
        ("Total non Taxable :", t["total_non_taxable"]),
        ("Total Taxables :", t["total_taxable"]),
        ("TVA 7% :", t["tva_7"]),
        ("TVA 19% :", t["tva_19"]),
        ("Timbre Fiscal :", t["timbre"]),
    ]:
        c.drawString(115*mm, y_tot, label)
        c.drawRightString(185*mm, y_tot, f"{value:.3f}")
        y_tot -= 5*mm

    c.setFont("Helvetica-Bold", 11)
    c.drawString(115*mm, y_tot - 2*mm, "Total Facture en TND")
    c.drawRightString(185*mm, y_tot - 2*mm, f"{t['total_final']:.3f}")

    # --- MONTANT EN LETTRES ---
    y_footer = y_tot - 15*mm
    c.setFont("Helvetica-Oblique", 9.5)
    c.drawString(25*mm, y_footer, "Total en votre aimable règlement :")

    c.setFont("Helvetica", 10)
    c.drawString(
        25*mm,
        y_footer - 6*mm,
        montant_en_lettres(t["total_final"])
    )

    c.save()
    overlay_buffer.seek(0)

    # ===== 2. FUSION AVEC L'ENTÊTE =====
    entete_path = os.path.abspath(fichier_entete)

    with open(entete_path, "rb") as f:
        base_pdf = PdfReader(f)

    overlay_pdf = PdfReader(overlay_buffer)

    page = base_pdf.pages[0]
    page.merge_page(overlay_pdf.pages[0])

    writer = PdfWriter()
    writer.add_page(page)

    final_buffer = io.BytesIO()
    writer.write(final_buffer)
    final_buffer.seek(0)

    return final_buffer
