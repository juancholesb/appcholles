from flask import Flask, jsonify, request, send_from_directory, make_response
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

db_pool = pool.SimpleConnectionPool(1, 10, DATABASE_URL, sslmode='require')

def get_db():
    return db_pool.getconn()

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

def get_current_user(request):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except:
        return None

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
                "minStock" INTEGER DEFAULT 5
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS variants (
                id SERIAL PRIMARY KEY,
                "productId" INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                stock INTEGER DEFAULT 0,
                UNIQUE("productId", name)
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
                note TEXT,
                discount REAL DEFAULT 0,
                "clientName" TEXT DEFAULT '',
                "clientPhone" TEXT DEFAULT ''
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assignments (
                id SERIAL PRIMARY KEY,
                "empId" INTEGER NOT NULL,
                "productId" INTEGER NOT NULL,
                "sellPrice" REAL DEFAULT 0,
                UNIQUE("empId", "productId")
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS assignment_variants (
                id SERIAL PRIMARY KEY,
                "empId" INTEGER NOT NULL,
                "productId" INTEGER NOT NULL,
                "variantId" INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
                stock INTEGER DEFAULT 0,
                UNIQUE("empId", "variantId")
            )
        ''')
        # Metas de ventas por empleado
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sales_goals (
                id SERIAL PRIMARY KEY,
                "empId" INTEGER NOT NULL,
                month TEXT NOT NULL,
                goal REAL DEFAULT 0,
                UNIQUE("empId", month)
            )
        ''')
        # Historial de clientes
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT,
                "empId" INTEGER,
                "lastSale" TEXT,
                "totalPurchases" REAL DEFAULT 0,
                "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Log de cambios
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS change_log (
                id SERIAL PRIMARY KEY,
                "empId" INTEGER,
                "empName" TEXT,
                action TEXT NOT NULL,
                entity TEXT,
                detail TEXT,
                "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

        cursor.execute('SELECT COUNT(*) FROM employees')
        if cursor.fetchone()[0] == 0:
            hashed = bcrypt.hashpw('admin2006'.encode(), bcrypt.gensalt()).decode()
            cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                           ('Admin', 'admin', hashed, 'admin'))
            cursor.execute('INSERT INTO products (name, cat, cost, wholesale, "minStock") VALUES (%s,%s,%s,%s,%s) RETURNING id',
                           ('Jugo natural', 'Bebidas', 2000, 3000, 5))
            prod_id = cursor.fetchone()[0]
            for sabor, stock in [('Fresa', 10), ('Mango', 12), ('Maracuyá', 8)]:
                cursor.execute('INSERT INTO variants ("productId", name, stock) VALUES (%s,%s,%s)',
                               (prod_id, sabor, stock))
            conn.commit()
            print('✅ Datos iniciales sembrados')

        # Migrar columnas nuevas si no existen
        for col, definition in [
            ('discount', 'REAL DEFAULT 0'),
            ('"clientName"', 'TEXT DEFAULT \'\''),
            ('"clientPhone"', 'TEXT DEFAULT \'\''),
        ]:
            try:
                cursor.execute(f'ALTER TABLE sales ADD COLUMN IF NOT EXISTS {col} {definition}')
                conn.commit()
            except:
                conn.rollback()

        print('✅ Base de datos inicializada')
    except Exception as e:
        conn.rollback()
        print(f'⚠️ Error en init_db: {e}')
    finally:
        cursor.close()
        release_db(conn)

def log_change(emp_id, emp_name, action, entity, detail):
    """Registra un cambio en el log."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO change_log ("empId", "empName", action, entity, detail) VALUES (%s,%s,%s,%s,%s)',
            (emp_id, emp_name, action, entity, detail)
        )
        conn.commit()
        cursor.close()
        release_db(conn)
    except:
        pass

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

    log_change(emp['id'], emp['name'], 'LOGIN', 'session', f'Inicio de sesión: {emp["user"]}')

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

@app.route('/api/employees', methods=['POST'])
@token_required
def create_employee():
    data = request.json
    user_info = get_current_user(request)
    hashed = bcrypt.hashpw(data['pass'].encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s) RETURNING id',
                       (data['name'], data['user'], hashed, data.get('role', 'empleado')))
        new_id = cursor.fetchone()[0]
        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'CREATE', 'employee', f'Nuevo empleado: {data["name"]}')
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
    user_info = get_current_user(request)
    new_pass = data['pass']
    if not new_pass.startswith('$2b$'):
        new_pass = bcrypt.hashpw(new_pass.encode(), bcrypt.gensalt()).decode()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE employees SET name=%s, "user"=%s, pass=%s, role=%s WHERE id=%s',
                       (data['name'], data['user'], new_pass, data.get('role', 'empleado'), id))
        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'UPDATE', 'employee', f'Editó empleado ID {id}: {data["name"]}')
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
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT name FROM employees WHERE id=%s', (id,))
        row = cursor.fetchone()
        cursor.execute('DELETE FROM employees WHERE id=%s', (id,))
        conn.commit()
        if user_info and row:
            log_change(user_info.get('id'), user_info.get('user'), 'DELETE', 'employee', f'Eliminó empleado: {row[0]}')
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== PRODUCTS =====================

def get_product_with_variants(cursor, product_id=None):
    if product_id:
        cursor.execute('SELECT * FROM products WHERE id = %s', (product_id,))
    else:
        cursor.execute('SELECT * FROM products ORDER BY id')
    products = cursor.fetchall()

    result = []
    for p in products:
        cursor.execute('SELECT * FROM variants WHERE "productId" = %s ORDER BY name', (p['id'],))
        variants = cursor.fetchall()
        total_stock = sum(v['stock'] for v in variants)
        result.append({
            **p,
            'stock': total_stock,
            'variants': [dict(v) for v in variants]
        })
    return result

@app.route('/api/products', methods=['GET'])
@token_required
def get_products():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        return jsonify(get_product_with_variants(cursor))
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/products', methods=['POST'])
@token_required
def create_product():
    data = request.json
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute(
            'INSERT INTO products (name, cat, cost, wholesale, "minStock") VALUES (%s,%s,%s,%s,%s) RETURNING id',
            (data['name'], data.get('cat', ''), data.get('cost', 0),
             data.get('wholesale', 0), data.get('minStock', 5))
        )
        new_id = cursor.fetchone()['id']
        for v in data.get('variants', []):
            cursor.execute('INSERT INTO variants ("productId", name, stock) VALUES (%s,%s,%s)',
                           (new_id, v['name'], v.get('stock', 0)))
        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'CREATE', 'product', f'Nuevo producto: {data["name"]}')
        result = get_product_with_variants(cursor, new_id)
        return jsonify(result[0] if result else {'id': new_id})
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
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute(
            'UPDATE products SET name=%s, cat=%s, cost=%s, wholesale=%s, "minStock"=%s WHERE id=%s',
            (data['name'], data.get('cat', ''), data.get('cost', 0),
             data.get('wholesale', 0), data.get('minStock', 5), id)
        )
        incoming = {v['name']: v for v in data.get('variants', [])}
        cursor.execute('SELECT * FROM variants WHERE "productId"=%s', (id,))
        existing = {v['name']: v for v in cursor.fetchall()}

        for name in existing:
            if name not in incoming:
                cursor.execute('DELETE FROM variants WHERE "productId"=%s AND name=%s', (id, name))
        for name, v in incoming.items():
            if name in existing:
                cursor.execute('UPDATE variants SET stock=%s WHERE "productId"=%s AND name=%s',
                               (v.get('stock', 0), id, name))
            else:
                cursor.execute('INSERT INTO variants ("productId", name, stock) VALUES (%s,%s,%s)',
                               (id, name, v.get('stock', 0)))

        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'UPDATE', 'product', f'Editó producto ID {id}: {data["name"]}')
        result = get_product_with_variants(cursor, id)
        return jsonify(result[0] if result else data)
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/products/<int:id>', methods=['DELETE'])
@token_required
def delete_product(id):
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT name FROM products WHERE id=%s', (id,))
        row = cursor.fetchone()
        cursor.execute('DELETE FROM products WHERE id=%s', (id,))
        conn.commit()
        if user_info and row:
            log_change(user_info.get('id'), user_info.get('user'), 'DELETE', 'product', f'Eliminó producto: {row[0]}')
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== VARIANTS =====================

@app.route('/api/variants', methods=['GET'])
@token_required
def get_all_variants():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM variants ORDER BY "productId", name')
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/variants/<int:id>/stock', methods=['PUT'])
@token_required
def update_variant_stock(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('UPDATE variants SET stock=%s WHERE id=%s', (data['stock'], id))
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
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute(
            '''INSERT INTO sales (date, emp, "empId", items, total, type, note, discount, "clientName", "clientPhone")
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',
            (data['date'], data['emp'], data['empId'], json.dumps(data['items']),
             data['total'], data['type'], data.get('note', ''),
             data.get('discount', 0), data.get('clientName', ''), data.get('clientPhone', ''))
        )
        new_id = cursor.fetchone()['id']

        for item in data['items']:
            if item.get('variantId'):
                cursor.execute(
                    'UPDATE variants SET stock = stock - %s WHERE id = %s AND stock >= %s',
                    (item['qty'], item['variantId'], item['qty'])
                )
                cursor.execute(
                    'UPDATE assignment_variants SET stock = stock - %s WHERE "empId"=%s AND "variantId"=%s AND stock >= %s',
                    (item['qty'], data['empId'], item['variantId'], item['qty'])
                )

        # Guardar/actualizar cliente si se proporcionó nombre
        client_name = data.get('clientName', '').strip()
        client_phone = data.get('clientPhone', '').strip()
        if client_name and data['type'] == 'venta':
            cursor.execute('SELECT id FROM clients WHERE name=%s AND "empId"=%s', (client_name, data['empId']))
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    'UPDATE clients SET "lastSale"=%s, "totalPurchases"="totalPurchases"+%s, phone=%s WHERE id=%s',
                    (data['date'], data['total'], client_phone or None, existing['id'])
                )
            else:
                cursor.execute(
                    'INSERT INTO clients (name, phone, "empId", "lastSale", "totalPurchases") VALUES (%s,%s,%s,%s,%s)',
                    (client_name, client_phone or None, data['empId'], data['date'], data['total'])
                )

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
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM sales')
        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'DELETE', 'sales', 'Borró todo el historial de ventas')
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
        assignments = cursor.fetchall()
        cursor.execute('SELECT * FROM assignment_variants')
        av = cursor.fetchall()
        return jsonify({'assignments': assignments, 'assignmentVariants': av})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/assignments', methods=['POST'])
@token_required
def save_assignment():
    data = request.json
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('''
            INSERT INTO assignments ("empId", "productId", "sellPrice")
            VALUES (%s, %s, %s)
            ON CONFLICT ("empId", "productId") DO UPDATE SET "sellPrice"=EXCLUDED."sellPrice"
            RETURNING id
        ''', (data['empId'], data['productId'], data['sellPrice']))
        new_id = cursor.fetchone()['id']

        for v in data.get('variants', []):
            cursor.execute('''
                INSERT INTO assignment_variants ("empId", "productId", "variantId", stock)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT ("empId", "variantId") DO UPDATE SET stock=EXCLUDED.stock
            ''', (data['empId'], data['productId'], v['variantId'], v['stock']))

        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'ASSIGN', 'assignment',
                       f'Asignó producto {data["productId"]} a empleado {data["empId"]}')
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
        cursor.execute('DELETE FROM assignment_variants WHERE "empId"=%s AND "productId"=%s', (emp_id, prod_id))
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== SALES GOALS =====================

@app.route('/api/goals', methods=['GET'])
@token_required
def get_goals():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM sales_goals')
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

@app.route('/api/goals', methods=['POST'])
@token_required
def save_goal():
    data = request.json
    user_info = get_current_user(request)
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('''
            INSERT INTO sales_goals ("empId", month, goal) VALUES (%s,%s,%s)
            ON CONFLICT ("empId", month) DO UPDATE SET goal=EXCLUDED.goal
            RETURNING id
        ''', (data['empId'], data['month'], data['goal']))
        new_id = cursor.fetchone()['id']
        conn.commit()
        if user_info:
            log_change(user_info.get('id'), user_info.get('user'), 'UPDATE', 'goal',
                       f'Meta de {data["month"]} para empleado {data["empId"]}: {data["goal"]}')
        return jsonify({'id': new_id, **data})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== CLIENTS =====================

@app.route('/api/clients', methods=['GET'])
@token_required
def get_clients():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        user_info = get_current_user(request)
        if user_info and user_info.get('role') == 'admin':
            cursor.execute('SELECT * FROM clients ORDER BY "totalPurchases" DESC')
        else:
            emp_id = user_info.get('id') if user_info else 0
            cursor.execute('SELECT * FROM clients WHERE "empId"=%s ORDER BY "totalPurchases" DESC', (emp_id,))
        return jsonify(cursor.fetchall())
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        release_db(conn)

# ===================== CHANGE LOG =====================

@app.route('/api/changelog', methods=['GET'])
@token_required
def get_changelog():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cursor.execute('SELECT * FROM change_log ORDER BY id DESC LIMIT 200')
        return jsonify(cursor.fetchall())
    except Exception as e:
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

try:
    init_db()
except Exception as e:
    print(f"⚠️ Error inicializando DB: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'\n🚀 StockMaster corriendo en puerto {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
