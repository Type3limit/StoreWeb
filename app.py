import sqlite3
import os
from datetime import datetime, date
from flask import Flask, request, jsonify, render_template, Response
import csv, io

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, 'store.db')
UPLOAD_DIR = os.path.join(BASE_DIR, 'static', 'uploads')

ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT DEFAULT '',
                cost_price REAL DEFAULT 0,
                sell_price REAL DEFAULT 0,
                stock INTEGER DEFAULT 0,
                unit TEXT DEFAULT '个',
                image TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS stock_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('in', 'out')),
                quantity INTEGER NOT NULL,
                note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
            CREATE TABLE IF NOT EXISTS sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                total_price REAL NOT NULL,
                note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
        ''')
        try:
            conn.execute("ALTER TABLE products ADD COLUMN image TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # column already exists


def _save_image(file):
    if not file or not file.filename:
        return ''
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        ext = '.jpg'
    name = f'{datetime.now().strftime("%Y%m%d%H%M%S")}_{os.urandom(4).hex()}{ext}'
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file.save(os.path.join(UPLOAD_DIR, name))
    return f'static/uploads/{name}'


def _parse_fields(existing=None):
    if request.is_json:
        d = request.get_json() or {}
        return {k: d.get(k, existing[k] if existing else '') for k in
                ('name', 'category', 'cost_price', 'sell_price', 'stock', 'unit')}
    return {
        'name': request.form.get('name', existing['name'] if existing else '').strip(),
        'category': request.form.get('category', existing['category'] if existing else ''),
        'cost_price': float(request.form.get('cost_price', 0) or 0),
        'sell_price': float(request.form.get('sell_price', 0) or 0),
        'stock': int(request.form.get('stock', 0) or 0),
        'unit': request.form.get('unit', existing['unit'] if existing else '个'),
    }


init_db()


@app.route('/')
def index():
    return render_template('index.html')


# ---- Dashboard ----
@app.route('/api/dashboard')
def dashboard():
    conn = get_db()
    today = date.today().isoformat()

    total_products = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    total_stock_value = conn.execute(
        "SELECT COALESCE(SUM(cost_price * stock), 0) FROM products"
    ).fetchone()[0]
    today_sales = conn.execute(
        "SELECT COALESCE(SUM(total_price), 0) FROM sales WHERE date(created_at) = ?",
        (today,)
    ).fetchone()[0]
    today_orders = conn.execute(
        "SELECT COUNT(*) FROM sales WHERE date(created_at) = ?",
        (today,)
    ).fetchone()[0]
    today_orders_nonfree = conn.execute(
        "SELECT COUNT(*) FROM sales WHERE date(created_at) = ? AND total_price > 0",
        (today,)
    ).fetchone()[0]
    today_cost = conn.execute(
        """SELECT COALESCE(SUM(s.quantity * p.cost_price), 0)
           FROM sales s JOIN products p ON s.product_id = p.id
           WHERE date(s.created_at) = ? AND s.total_price > 0""",
        (today,)
    ).fetchone()[0]
    today_giveaways = conn.execute(
        "SELECT COALESCE(SUM(quantity), 0) FROM sales WHERE date(created_at) = ? AND total_price = 0",
        (today,)
    ).fetchone()[0]
    low_stock = conn.execute(
        "SELECT id, name, stock, unit FROM products WHERE stock < 10 ORDER BY stock ASC LIMIT 10"
    ).fetchall()
    recent_sales = conn.execute(
        """SELECT s.id, p.name, s.quantity, s.total_price, s.created_at
           FROM sales s JOIN products p ON s.product_id = p.id
           ORDER BY s.created_at DESC LIMIT 5"""
    ).fetchall()
    top_products = conn.execute(
        """SELECT p.name, SUM(s.quantity) as total_qty, SUM(s.total_price) as total_amt
           FROM sales s JOIN products p ON s.product_id = p.id
           WHERE date(s.created_at) = ? AND s.total_price > 0
           GROUP BY p.id ORDER BY total_qty DESC LIMIT 3""",
        (today,)
    ).fetchall()

    conn.close()
    return jsonify({
        'total_products': total_products,
        'total_stock_value': round(total_stock_value, 2),
        'today_sales': round(today_sales, 2),
        'today_orders': today_orders,
        'today_orders_nonfree': today_orders_nonfree,
        'today_cost': round(today_cost, 2),
        'today_profit': round(today_sales - today_cost, 2),
        'today_giveaways': today_giveaways or 0,
        'low_stock': [dict(r) for r in low_stock],
        'recent_sales': [dict(r) for r in recent_sales],
        'top_products': [dict(r) for r in top_products]
    })


# ---- Export CSV ----
@app.route('/api/sales/export')
def export_sales():
    period = request.args.get('period', 'all')
    conn = get_db()
    if period == 'today':
        today = date.today().isoformat()
        rows = conn.execute(
            """SELECT s.id, p.name, s.quantity, s.total_price, s.note, s.created_at
               FROM sales s JOIN products p ON s.product_id = p.id
               WHERE date(s.created_at) = ? ORDER BY s.created_at DESC""",
            (today,)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT s.id, p.name, s.quantity, s.total_price, s.note, s.created_at
               FROM sales s JOIN products p ON s.product_id = p.id
               ORDER BY s.created_at DESC"""
        ).fetchall()
    conn.close()

    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(['ID', '商品名称', '数量', '金额', '备注', '时间'])
    for r in rows:
        w.writerow([r['id'], r['name'], r['quantity'], f"{r['total_price']:.2f}",
                     r['note'] or '', r['created_at']])
    csv_data = output.getvalue()
    output.close()
    return Response(csv_data, mimetype='text/csv',
                    headers={'Content-Disposition': 'attachment;filename=sales.csv'})


# ---- Products ----
@app.route('/api/products')
def list_products():
    search = request.args.get('search', '')
    conn = get_db()
    if search:
        rows = conn.execute(
            "SELECT * FROM products WHERE name LIKE ? OR category LIKE ? ORDER BY updated_at DESC",
            (f'%{search}%', f'%{search}%')
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM products ORDER BY updated_at DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/products', methods=['POST'])
def create_product():
    fields = _parse_fields()
    if not fields['name']:
        return jsonify({'error': '商品名称不能为空'}), 400

    image_path = ''
    if not request.is_json:
        image_path = _save_image(request.files.get('image'))

    conn = get_db()
    conn.execute(
        """INSERT INTO products (name, category, cost_price, sell_price, stock, unit, image)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (fields['name'], fields['category'], fields['cost_price'],
         fields['sell_price'], fields['stock'], fields['unit'], image_path)
    )
    conn.commit()
    pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route('/api/products/<int:pid>', methods=['PUT'])
def update_product(pid):
    conn = get_db()
    existing = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': '商品不存在'}), 404

    fields = _parse_fields(existing)
    image_path = existing['image']
    if not request.is_json:
        file = request.files.get('image')
        if file and file.filename:
            image_path = _save_image(file)

    conn.execute(
        """UPDATE products SET name=?, category=?, cost_price=?, sell_price=?,
           stock=?, unit=?, image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?""",
        (fields['name'], fields['category'], fields['cost_price'],
         fields['sell_price'], fields['stock'], fields['unit'], image_path, pid)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route('/api/products/<int:pid>', methods=['DELETE'])
def delete_product(pid):
    conn = get_db()
    existing = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': '商品不存在'}), 404

    conn.execute("DELETE FROM stock_records WHERE product_id = ?", (pid,))
    conn.execute("DELETE FROM sales WHERE product_id = ?", (pid,))
    conn.execute("DELETE FROM products WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({'message': '删除成功'})


# ---- Stock Records ----
@app.route('/api/stock-records')
def list_stock_records():
    conn = get_db()
    rows = conn.execute(
        """SELECT sr.id, sr.product_id, p.name as product_name, sr.type,
           sr.quantity, sr.note, sr.created_at
           FROM stock_records sr JOIN products p ON sr.product_id = p.id
           ORDER BY sr.created_at DESC LIMIT 100"""
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/stock-records', methods=['POST'])
def create_stock_record():
    data = request.get_json()
    product_id = data.get('product_id')
    qty = data.get('quantity', 0)
    rtype = data.get('type', 'in')

    if not product_id or qty <= 0:
        return jsonify({'error': '参数错误'}), 400

    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not product:
        conn.close()
        return jsonify({'error': '商品不存在'}), 404

    if rtype == 'in':
        new_stock = product['stock'] + qty
    else:
        new_stock = product['stock'] - qty
        if new_stock < 0:
            conn.close()
            return jsonify({'error': f'库存不足，当前库存: {product["stock"]}'}), 400

    conn.execute(
        "INSERT INTO stock_records (product_id, type, quantity, note) VALUES (?, ?, ?, ?)",
        (product_id, rtype, qty, data.get('note', ''))
    )
    conn.execute("UPDATE products SET stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                 (new_stock, product_id))
    conn.commit()
    row = conn.execute(
        """SELECT sr.id, sr.product_id, p.name as product_name, sr.type,
           sr.quantity, sr.note, sr.created_at
           FROM stock_records sr JOIN products p ON sr.product_id = p.id
           WHERE sr.id = last_insert_rowid()"""
    ).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


# ---- Sales ----
@app.route('/api/sales')
def list_sales():
    conn = get_db()
    rows = conn.execute(
        """SELECT s.id, s.product_id, p.name as product_name, s.quantity,
           s.total_price, s.note, s.created_at
           FROM sales s JOIN products p ON s.product_id = p.id
           ORDER BY s.created_at DESC LIMIT 100"""
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/sales', methods=['POST'])
def create_sale():
    data = request.get_json()
    product_id = data.get('product_id')
    qty = data.get('quantity', 0)

    if not product_id or qty <= 0:
        return jsonify({'error': '参数错误'}), 400

    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not product:
        conn.close()
        return jsonify({'error': '商品不存在'}), 404

    total_price = data.get('total_price', product['sell_price'] * qty)
    new_stock = product['stock'] - qty
    if new_stock < 0:
        conn.close()
        return jsonify({'error': f'库存不足，当前库存: {product["stock"]}'}), 400

    conn.execute(
        "INSERT INTO sales (product_id, quantity, total_price, note) VALUES (?, ?, ?, ?)",
        (product_id, qty, total_price, data.get('note', ''))
    )
    conn.execute("UPDATE products SET stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                 (new_stock, product_id))
    conn.commit()
    row = conn.execute(
        """SELECT s.id, s.product_id, p.name as product_name, s.quantity,
           s.total_price, s.note, s.created_at
           FROM sales s JOIN products p ON s.product_id = p.id
           WHERE s.id = last_insert_rowid()"""
    ).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route('/api/sales/<int:sid>', methods=['DELETE'])
def delete_sale(sid):
    conn = get_db()
    sale = conn.execute("SELECT * FROM sales WHERE id = ?", (sid,)).fetchone()
    if not sale:
        conn.close()
        return jsonify({'error': '记录不存在'}), 404
    conn.execute("UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                 (sale['quantity'], sale['product_id']))
    conn.execute("DELETE FROM sales WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({'message': '已回退'})


@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/static/uploads/'):
        response.cache_control.max_age = 604800  # 1 week
        response.cache_control.public = True
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
