# /// script
# requires-python = ">=3.12"
# dependencies = ["flask","pillow","flask-cors"]
# ///

from flask_cors import CORS
from flask import Flask, request, jsonify
from PIL import Image
import os

app = Flask(__name__)
CORS(app)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mocked state (always correct mode)
state_ref = {
    "active_page": 1,
    "active_mode": 3
}

def trigger_full_refresh():
    print("[MOCK] Full refresh triggered")

def trigger_partial_refresh(bbox):
    print(f"[MOCK] Partial refresh triggered: {bbox}")

@app.route("/api/push_image", methods=["POST"])
def api_push_image():
    """
    Mock endpoint for Page 1, Mode 3 (Custom B&W API Push).
    Forces 800x480 B&W and simulates refresh logic.
    """

    if state_ref.get("active_page") != 1 or state_ref.get("active_mode") != 3:
        return jsonify({"error": "Device not in API Push mode"}), 403

    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files["image"]
    current_image_path = os.path.join(UPLOAD_DIR, "api_current.bmp")

    is_first_push = not os.path.exists(current_image_path)

    try:
        img = Image.open(file).convert("1").resize((800, 480))
        img.save(current_image_path, format="BMP")
    except Exception as e:
        return jsonify({"error": f"Failed to process image: {e}"}), 400

    if request.form.get("force_full", "false").lower() == "true" or is_first_push:
        trigger_full_refresh()
        return jsonify({
            "status": "success",
            "update_type": "full_refresh"
        })

    full_screen_bbox = (0, 0, 800, 480)
    trigger_partial_refresh(full_screen_bbox)

    return jsonify({
        "status": "success",
        "update_type": "partial_fullscreen",
        "bounding_box": full_screen_bbox
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)