from flask import Flask, Response, request, send_file, make_response
from flask_cors import CORS
from creationdossier import create_dossier
from supabase import create_client
import json
from creationfacture import generer_facture_eden_dynamique

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": [
        "https://transit-project.vercel.app"
    ]}},
    supports_credentials=True
)

    
supabase = create_client(
    "https://xjdcffmhhiknxwcfogxr.supabase.co",
    "sb_publishable_-3JXwaLSYJB0lZmmuXJ1pQ_TdRb4n50"  
)

@app.route('/generate-pdf', methods=['POST'])
def handle_pdf():
    try:
        data = request.json
        if not data:
            return {"error": "No data provided"}, 400

        # Appel de la fonction modifiée qui renvoie un buffer
        pdf_buffer = create_dossier(data)
        
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"Dossier_{data.get('dossier_no', 'export')}.pdf"
        )
    except Exception as e:
        print(f"Erreur: {e}")
        return make_response({"error": str(e)}, 500)


from io import BytesIO

@app.route("/facture/<int:facture_id>", methods=["GET"])
def telecharger_facture(facture_id):

    res = (
        supabase
        .table("factures")
        .select("data_json")
        .eq("id", facture_id)
        .single()
        .execute()
    )

    if not res.data or not res.data.get("data_json"):
        return {"error": "Facture introuvable"}, 404

    data = res.data["data_json"]
    numero = data["facture"]["numero"]

    pdf_buffer = generer_facture_eden_dynamique(
        "Entete EDEN.pdf",
        data
    )

    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"Facture_{numero}.pdf"
    )
