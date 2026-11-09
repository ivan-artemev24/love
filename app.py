import os
import uuid
from datetime import datetime
from PIL import Image, ImageOps
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Конфигурация приложения
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
SECRET_CODEWORD = 'буся'  # Кодовое слово в нижнем регистре

app.config['SECRET_KEY'] = 'romantic-secret-key-2026'
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'love_story.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024  # До 25 МБ

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
db = SQLAlchemy(app)


class Memory(db.Model):
    __tablename__ = 'memories'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    event_date = db.Column(db.String(50), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    image_url = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description or '',
            'event_date': self.event_date,
            'lat': self.lat,
            'lng': self.lng,
            'image_url': self.image_url,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }


with app.app_context():
    db.create_all()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def verify_codeword(word):
    """Проверяет кодовое слово без учета регистра и лишних пробелов."""
    return bool(word) and word.strip().lower() == SECRET_CODEWORD


def process_and_save_image(file_storage):
    """Корректирует EXIF-ориентацию, сжимает фото до 1600px и сохраняет в WebP."""
    secure_filename(file_storage.filename)
    unique_name = f"{uuid.uuid4().hex}.webp"
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)

    image = Image.open(file_storage)
    image = ImageOps.exif_transpose(image)

    if image.mode in ('RGBA', 'LA', 'P'):
        image = image.convert('RGB')

    max_size = 1600
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    image.save(save_path, 'WEBP', quality=82, optimize=True)

    return f"/static/uploads/{unique_name}"


def remove_image_file(image_url):
    """Удаляет файл изображения с диска при удалении или замене фото."""
    if not image_url:
        return
    filename = os.path.basename(image_url)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except OSError:
            pass


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/markers', methods=['GET'])
def get_markers():
    memories = Memory.query.order_by(Memory.event_date.desc(), Memory.id.desc()).all()
    return jsonify([m.to_dict() for m in memories])


@app.route('/api/markers', methods=['POST'])
def add_marker():
    codeword = request.form.get('codeword', '')
    if not verify_codeword(codeword):
        return jsonify({'error': 'Неверное кодовое слово!'}), 403

    title = request.form.get('title', '').strip()
    event_date = request.form.get('event_date', '').strip()
    description = request.form.get('description', '').strip()
    lat = request.form.get('lat')
    lng = request.form.get('lng')

    if not title or not lat or not lng:
        return jsonify({'error': 'Название и координаты обязательны'}), 400

    try:
        lat_float = float(lat)
        lng_float = float(lng)
    except ValueError:
        return jsonify({'error': 'Некорректные координаты'}), 400

    image_url = None
    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename != '' and allowed_file(file.filename):
            try:
                image_url = process_and_save_image(file)
            except Exception as e:
                return jsonify({'error': f'Ошибка обработки фото: {str(e)}'}), 500

    new_memory = Memory(
        title=title,
        description=description,
        event_date=event_date or 'Памятный день',
        lat=lat_float,
        lng=lng_float,
        image_url=image_url
    )

    db.session.add(new_memory)
    db.session.commit()

    return jsonify(new_memory.to_dict()), 201


@app.route('/api/markers/<int:marker_id>', methods=['PUT'])
def update_marker(marker_id):
    codeword = request.form.get('codeword', '')
    if not verify_codeword(codeword):
        return jsonify({'error': 'Неверное кодовое слово!'}), 403

    memory = Memory.query.get_or_404(marker_id)

    title = request.form.get('title', '').strip()
    event_date = request.form.get('event_date', '').strip()
    description = request.form.get('description', '').strip()

    if not title:
        return jsonify({'error': 'Название не может быть пустым'}), 400

    memory.title = title
    memory.event_date = event_date or 'Памятный день'
    memory.description = description

    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename != '' and allowed_file(file.filename):
            try:
                new_image_url = process_and_save_image(file)
                remove_image_file(memory.image_url)
                memory.image_url = new_image_url
            except Exception as e:
                return jsonify({'error': f'Ошибка обработки фото: {str(e)}'}), 500

    db.session.commit()
    return jsonify(memory.to_dict()), 200


@app.route('/api/markers/<int:marker_id>', methods=['DELETE'])
def delete_marker(marker_id):
    data = request.get_json(silent=True) or {}
    codeword = data.get('codeword', '')
    if not verify_codeword(codeword):
        return jsonify({'error': 'Неверное кодовое слово!'}), 403

    memory = Memory.query.get_or_404(marker_id)
    remove_image_file(memory.image_url)

    db.session.delete(memory)
    db.session.commit()

    return jsonify({'message': 'Воспоминание удалено', 'id': marker_id}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
