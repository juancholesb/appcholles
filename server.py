from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from psycopg2 import pool
import os
import json
import bcrypt
import jwt
import datetime
import psycopg2.extras
from functools import wraps

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DATABASE_URL = os.environ.get('DATABASE_URL')
JWT_SECRET = os.environ.get('JWT_SECRET', 'stockmaster_secret_2026')

# Pool de conexiones (min 1, max 10)
db_pool = pool.SimpleConnectionPool(1, 10, DATABASE_URL, sslmode='require')

def get_db():
    conn = db_pool.getconn()
    return conn

def release_db(conn):
    db_pool.putconn(conn)

# ===================== JWT AUTH =====================

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token requerido'}), 401
        try:
            jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        return f(*args, **kwargs)
    return decorated

# ===================== INIT DB =====================

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                "user" TEXT UNIQUE NOT NULL,
                pass TEXT NOT NULL,
                role TEXT DEFAULT 'empleado',
                "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                cat TEXT,
                cost REAL DEFAULT 0,
                wholesale REAL DEFAULT 0,
                stock INTEGER DEFAULT 0,
                "minStock" INTEGER DEFAULT 5,
                variants TEXT DEFAULT '[]'
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                emp TEXT,
                "empId" INTEGER,
                items TEXT,
                total REAL DEFAULT 0,
                type TEXT DEFAULT 'venta',
                note TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assignments (
                id SERIAL PRIMARY KEY,
                "empId" INTEGER NOT NULL,
                "productId" INTEGER NOT NULL,
                stock INTEGER DEFAULT 0,
                "sellPrice" REAL DEFAULT 0,
                UNIQUE("empId", "productId")
            )
        ''')
        conn.commit()

        cursor.execute('SELECT COUNT(*) FROM employees')
        if cursor.fetchone()[0] == 0:
            hashed = bcrypt.hashpw('admin2006'.encode(), bcrypt.gensalt()).decode()
            cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                           ('Admin', 'admin', hashed, 'admin'))
            products = [
                ('Camiseta básica', 'Ropa', 8, 12, 200, 10, '[]'),
                ('Pantalón casual', 'Ropa', 15, 22, 100, 5, '[]'),
                ('Audífonos Bluetooth', 'Electrónica', 25, 38, 50, 5, '[]'),
                ('Perfume 100ml', 'Belleza', 12, 18, 80, 10, '[]'),
                ('Mochila urbana', 'Accesorios', 20, 30, 60, 4, '[]'),
            ]
            for p in products:
                cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock", variants) VALUES (%s,%s,%s,%s,%s,%s,%s)', p)
            conn.commit()
            print('✅ Datos iniciales sembrados')

        print('✅ Base de datos inicializada')
    except Exception as e:
        conn.rollback()
        print(f'⚠️ Error en init_db: {e}')
    finally:
        cursor.close()
        release_db(conn)

# ===================== LOGIN =====================

login_attempts = {}

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('user', '').strip()
    password = data.get('pass', '')

    attempts = login_attempts.get(username, 0)
    if attempts >= 5:
        return jsonify({'error': 'Demasiados intentos. Espera unos minutos.'}), 429

    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM employees WHERE "user" = %s', (username,))
        emp = cursor.fetchone()
    except Exception as e:
        return jsonify({'error': 'Error en servidor'}), 500
    finally:
        cursor.close()
        release_db(conn)

    if not emp:
        login_attempts[username] = attempts + 1
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401

    stored = emp['pass'].encode() if isinstance(emp['pass'], str) else emp['pass']
    password_bytes = password.encode()

    # Soporte para contraseñas viejas en texto plano (migración automática a bcrypt)
    try:
        valid = bcrypt.checkpw(password_bytes, stored)
    except Exception:
        valid = (emp['pass'] == password)
        if valid:
            new_hash = bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode()
            conn2 = get_db()
            cur2 = conn2.cursor()
            try:
                cur2.execute('UPDATE employees SET pass=%s WHERE id=%s', (new_hash, emp['id']))
                conn2.commit()
            finally:
                cur2.close()
                release_db(conn2)

    if not valid:
        login_attempts[username] = attempts + 1
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401

    login_attempts.pop(username, None)

    token = jwt.encode({
        'id': emp['id'],
        'user': emp['user'],
        'role': emp['role'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, JWT_SECRET, algorithm='HS256')

    return jsonify({
        'token': token,
        'id': emp['id'],
        'name': emp['name'],
        'user': emp['user'],
        'role': emp['role'],
        'pass': emp['pass']
    })

# ===================== EMPLOYEES =====================

@app.route('/api/employees', methods=['GET'])
@token_required
def get_employees():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM employees')
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/employees/<int:id>', methods=['GET'])
@token_required
def get_employee(id):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM employees WHERE id = %s', (id,))
        row = cursor.fetchone()
        return jsonify(row if row else None)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/employees/user/<username>', methods=['GET'])
@token_required
def get_employee_by_user(username):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM employees WHERE "user" = %s', (username,))
        row = cursor.fetchone()
        return jsonify(row if row else None)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/employees', methods=['POST'])
@token_required
def create_employee():
    data = request.json
    hashed = bcrypt.hashpw(data['pass'].encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s) RETURNING id',
                       (data['name'], data['user'], hashed, data.get('role', 'empleado')))
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'id': new_id, **data})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/employees/<int:id>', methods=['PUT'])
@token_required
def update_employee(id):
    data = request.json
    new_pass = data['pass']
    if not new_pass.startswith('$2b$'):
        new_pass = bcrypt.hashpw(new_pass.encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE employees SET name=%s, "user"=%s, pass=%s, role=%s WHERE id=%s',
                       (data['name'], data['user'], new_pass, data.get('role', 'empleado'), id))
        conn.commit()
        return jsonify(data)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/employees/<int:id>', methods=['DELETE'])
@token_required
def delete_employee(id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM employees WHERE id=%s', (id,))
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== PRODUCTS =====================

@app.route('/api/products', methods=['GET'])
@token_required
def get_products():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM products')
        rows = cursor.fetchall()
        for r in rows:
            r['variants'] = json.loads(r.get('variants') or '[]')
        return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/products', methods=['POST'])
@token_required
def create_product():
    data = request.json
    variants = json.dumps(data.get('variants', []))
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock", variants) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                       (data['name'], data.get('cat', ''), data.get('cost', 0), data.get('wholesale', 0),
                        data.get('stock', 0), data.get('minStock', 5), variants))
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'id': new_id, **data})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/products/<int:id>', methods=['PUT'])
@token_required
def update_product(id):
    data = request.json
    variants = json.dumps(data.get('variants', []))
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE products SET name=%s, cat=%s, cost=%s, wholesale=%s, stock=%s, "minStock"=%s, variants=%s WHERE id=%s',
                       (data['name'], data.get('cat', ''), data.get('cost', 0), data.get('wholesale', 0),
                        data.get('stock', 0), data.get('minStock', 5), variants, id))
        conn.commit()
        return jsonify(data)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/products/<int:id>', methods=['DELETE'])
@token_required
def delete_product(id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM products WHERE id=%s', (id,))
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== SALES =====================

@app.route('/api/sales', methods=['GET'])
@token_required
def get_sales():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM sales ORDER BY id DESC')
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/sales', methods=['POST'])
@token_required
def create_sale():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO sales (date, emp, "empId", items, total, type, note) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                       (data['date'], data['emp'], data['empId'], json.dumps(data['items']),
                        data['total'], data['type'], data.get('note', '')))
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'id': new_id, **data})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/sales/all', methods=['DELETE'])
@token_required
def delete_all_sales():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM sales')
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== ASSIGNMENTS =====================

@app.route('/api/assignments', methods=['GET'])
@token_required
def get_assignments():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM assignments')
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/assignments', methods=['POST'])
@token_required
def save_assignment():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO assignments ("empId", "productId", stock, "sellPrice")
            VALUES (%s, %s, %s, %s)
            ON CONFLICT ("empId", "productId") DO UPDATE SET stock=EXCLUDED.stock, "sellPrice"=EXCLUDED."sellPrice"
            RETURNING id
        ''', (data['empId'], data['productId'], data['stock'], data['sellPrice']))
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'id': new_id, **data})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/assignments/<int:emp_id>/<int:prod_id>', methods=['DELETE'])
@token_required
def delete_assignment(emp_id, prod_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM assignments WHERE "empId"=%s AND "productId"=%s', (emp_id, prod_id))
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== NEXT IDS =====================

@app.route('/api/nextids', methods=['GET'])
@token_required
def get_next_ids():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT COALESCE(MAX(id), 0) FROM products')
        max_prod = cursor.fetchone()[0]
        cursor.execute('SELECT COALESCE(MAX(id), 0) FROM sales')
        max_sale = cursor.fetchone()[0]
        cursor.execute('SELECT COALESCE(MAX(id), 0) FROM employees')
        max_emp = cursor.fetchone()[0]
        return jsonify({'pid': max_prod + 1, 'sid': max_sale + 1, 'eid': max_emp + 1})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== STATIC =====================

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    try:
        init_db()
    except Exception as e:
        print(f"⚠️ Error inicializando DB: {e}")
    print(f'\n🚀 StockMaster corriendo en puerto {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
