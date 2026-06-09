from __future__ import annotations

import os

from flask import Flask
from flask_cors import CORS

from api import upload, geocode, floors, process, rooms, objects

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024
CORS(app)

app.register_blueprint(upload.bp)
app.register_blueprint(geocode.bp)
app.register_blueprint(floors.bp)
app.register_blueprint(process.bp)
app.register_blueprint(rooms.bp)
app.register_blueprint(objects.bp)



if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)
