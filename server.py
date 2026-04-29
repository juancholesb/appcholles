from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import json
import psycopg2
import psycopg2.extras

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Obtener la URL de Render (Variables de Entorno)
DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db():
    # Se agrega sslmode=require para que Supabase acepte la conexión desde Render
    conn = psycopg2.connect(DATABASE_URL, sslmode='require')
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Tablas con sintaxis PostgreSQL
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

    # Verificar si hay empleados, si no, insertar iniciales
    cursor.execute('SELECT COUNT(*) FROM employees')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                       ('Juan Pérez', 'empleado', 'emp123', 'empleado'))
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                       ('Admin', 'admin', 'admin2006', 'admin'))
        
        # Productos iniciales
        products = [
            ('Camiseta básica', 'Ropa', 8, 12, 200, 10, '[]'),
            ('Pantalón casual', 'Ropa', 15, 22, 100, 5, '[]'),
            ('Audífonos Bluetooth', 'Electrónica', 25, 38, 50, 5, '[]'),
            ('Perfume 100ml', 'Belleza', 12, 18, 80, 10, '[]'),
            ('Mochila urbana', 'Accesorios', 20, 30, 60, 4, '[]'),
        ]
        for p in products:
            cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock", variants) VALUES (%s, %s, %s, %s, %s, %s, %s)', p)
        
        conn.commit()
        print('✅ Datos iniciales sembrados')

    cursor.close()
    conn.close()
    print('✅ Base de datos inicializada')

# ===================== API ROUTES =====================

@app.route('/api/employees', methods=['GET'])
def get_employees():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees')
    rows = cursor.fetchall()
    conn.close()
    return jsonify(rows)

@app.route('/api/employees/<int:id>', methods=['GET'])
def get_employee(id):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees WHERE id = %s', (id,))
    row = cursor.fetchone()
    conn.close()
    return jsonify(row if row else None)

@app.route('/api/employees/user/<username>', methods=['GET'])
def get_employee_by_user(username):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees WHERE "user" = %s', (username,))
    row = cursor.fetchone()
    conn.close()
    return jsonify(row if row else None)

@app.route('/api/employees', methods=['POST'])
def create_employee():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s) RETURNING id',
                   (data['name'], data['user'], data['pass'], data.get('role', 'empleado')))
    new_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return jsonify({'id': new_id, **data})

@app.route('/api/products', methods=['GET'])
def get_products():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM products')
    rows = cursor.fetchall()
    conn.close()
    for r in rows:
        r['variants'] = json.loads(r.get('variants') or '[]')
    return jsonify(rows)

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    variants = json.dumps(data.get('variants', []))
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock", variants) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id',
                   (data['name'], data.get('cat', ''), data.get('cost', 0), data.get('wholesale', 0),
                    data.get('stock', 0), data.get('minStock', 5), variants))
    new_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return jsonify({'id': new_id, **data})

@app.route('/api/sales', methods=['POST'])
def create_sale():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO sales (date, emp, "empId", items, total, type, note) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id',
                   (data['date'], data['emp'], data['empId'], json.dumps(data['items']),
                    data['total'], data['type'], data.get('note', '')))
    new_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return jsonify({'id': new_id, **data})

@app.route('/api/nextids', methods=['GET'])
def get_next_ids():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COALESCE(MAX(id), 0) FROM products')
    max_prod = cursor.fetchone()[0]
    cursor.execute('SELECT COALESCE(MAX(id), 0) FROM sales')
    max_sale = cursor.fetchone()[0]
    cursor.execute('SELECT COALESCE(MAX(id), 0) FROM employees')
    max_emp = cursor.fetchone()[0]
    conn.close()
    return jsonify({'pid': max_prod + 1, 'sid': max_sale + 1, 'eid': max_emp + 1})

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # Inicializar DB antes de arrancar
    try:
        init_db()
    except Exception as e:
        print(f"⚠️ Error inicializando DB (posiblemente ya existe): {e}")
    
    print(f'\n🚀 StockMaster corriendo en puerto {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
