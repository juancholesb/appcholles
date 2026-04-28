from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import json
import psycopg2
import psycopg2.extras

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            "user" TEXT UNIQUE NOT NULL,
            pass TEXT NOT NULL,
            role TEXT DEFAULT 'empleado',
            "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
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
            "minStock" INTEGER DEFAULT 5
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

    # Seed default data if empty
    cursor.execute('SELECT COUNT(*) FROM employees')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                       ('Juan Pérez', 'empleado', 'emp123', 'empleado'))
        cursor.execute('INSERT INTO employees (name, "user", pass, role) VALUES (%s, %s, %s, %s)',
                       ('Admin', 'admin', 'admin2006', 'admin'))

        products = [
            ('Camiseta básica', 'Ropa', 8, 12, 200, 10),
            ('Pantalón casual', 'Ropa', 15, 22, 100, 5),
            ('Audífonos Bluetooth', 'Electrónica', 25, 38, 50, 5),
            ('Perfume 100ml', 'Belleza', 12, 18, 80, 10),
            ('Mochila urbana', 'Accesorios', 20, 30, 60, 4),
        ]
        for p in products:
            cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock") VALUES (%s, %s, %s, %s, %s, %s)', p)

        cursor.execute('INSERT INTO assignments ("empId", "productId", stock, "sellPrice") VALUES (%s, %s, %s, %s)', (1, 1, 30, 20))
        cursor.execute('INSERT INTO assignments ("empId", "productId", stock, "sellPrice") VALUES (%s, %s, %s, %s)', (1, 3, 8, 60))

        cursor.execute('INSERT INTO sales (date, emp, "empId", items, total, type, note) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                       ('20/04/2025 10:30', 'Administrador', 0, '[{"name":"Camiseta básica","qty":2,"price":20,"pid":1}]', 40, 'venta', ''))
        cursor.execute('INSERT INTO sales (date, emp, "empId", items, total, type, note) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                       ('21/04/2025 14:00', 'Juan Pérez', 1, '[{"name":"Audífonos Bluetooth","qty":1,"price":60,"pid":3}]', 60, 'venta', 'Cliente VIP'))
        cursor.execute('INSERT INTO sales (date, emp, "empId", items, total, type, note) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                       ('22/04/2025 09:15', 'Juan Pérez', 1, '[{"name":"Perfume 100ml","qty":1,"price":30,"pid":4}]', 30, 'reembolso', 'Producto dañado'))

        conn.commit()
        print('✅ Datos iniciales sembrados')

    conn.close()
    print('✅ Base de datos inicializada')

# ===================== API ROUTES =====================

# Employees
@app.route('/api/employees', methods=['GET'])
def get_employees():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees')
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/employees/<int:id>', methods=['GET'])
def get_employee(id):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees WHERE id = %s', (id,))
    row = cursor.fetchone()
    conn.close()
    return jsonify(dict(row) if row else None)

@app.route('/api/employees/user/<username>', methods=['GET'])
def get_employee_by_user(username):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM employees WHERE "user" = %s', (username,))
    row = cursor.fetchone()
    conn.close()
    return jsonify(dict(row) if row else None)

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

@app.route('/api/employees/<int:id>', methods=['PUT'])
def update_employee(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE employees SET name = %s, "user" = %s, pass = %s, role = %s WHERE id = %s',
                   (data['name'], data['user'], data['pass'], data.get('role', 'empleado'), id))
    conn.commit()
    conn.close()
    return jsonify({'id': id, **data})

@app.route('/api/employees/<int:id>', methods=['DELETE'])
def delete_employee(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM employees WHERE id = %s', (id,))
    cursor.execute('DELETE FROM assignments WHERE "empId" = %s', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Products
@app.route('/api/products', methods=['GET'])
def get_products():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM products')
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO products (name, cat, cost, wholesale, stock, "minStock") VALUES (%s, %s, %s, %s, %s, %s) RETURNING id',
                   (data['name'], data.get('cat', ''), data.get('cost', 0), data.get('wholesale', 0),
                    data.get('stock', 0), data.get('minStock', 5)))
    new_id = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    return jsonify({'id': new_id, **data})

@app.route('/api/products/<int:id>', methods=['PUT'])
def update_product(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE products SET name = %s, cat = %s, cost = %s, wholesale = %s, stock = %s, "minStock" = %s WHERE id = %s',
                   (data['name'], data.get('cat', ''), data.get('cost', 0), data.get('wholesale', 0),
                    data.get('stock', 0), data.get('minStock', 5), id))
    conn.commit()
    conn.close()
    return jsonify({'id': id, **data})

@app.route('/api/products/<int:id>', methods=['DELETE'])
def delete_product(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM products WHERE id = %s', (id,))
    cursor.execute('DELETE FROM assignments WHERE "productId" = %s', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Sales
@app.route('/api/sales', methods=['GET'])
def get_sales():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM sales ORDER BY id DESC')
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

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

# Assignments
@app.route('/api/assignments', methods=['GET'])
def get_assignments():
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM assignments')
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/assignments/employee/<int:empId>', methods=['GET'])
def get_assignments_by_employee(empId):
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute('SELECT * FROM assignments WHERE "empId" = %s', (empId,))
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/assignments', methods=['POST'])
def create_or_update_assignment():
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO assignments ("empId", "productId", stock, "sellPrice") VALUES (%s, %s, %s, %s)
        ON CONFLICT ("empId", "productId") DO UPDATE SET stock = EXCLUDED.stock, "sellPrice" = EXCLUDED."sellPrice"
    ''', (data['empId'], data['productId'], data['stock'], data['sellPrice']))
    conn.commit()
    conn.close()
    return jsonify(data)

@app.route('/api/assignments/<int:empId>/<int:productId>', methods=['DELETE'])
def delete_assignment(empId, productId):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM assignments WHERE "empId" = %s AND "productId" = %s', (empId, productId))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Next IDs
@app.route('/api/nextids', methods=['GET'])
def get_next_ids():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT MAX(id) FROM products')
    max_prod = cursor.fetchone()[0] or 0
    cursor.execute('SELECT MAX(id) FROM sales')
    max_sale = cursor.fetchone()[0] or 0
    cursor.execute('SELECT MAX(id) FROM employees')
    max_emp = cursor.fetchone()[0] or 0
    conn.close()
    return jsonify({'pid': max_prod + 1, 'sid': max_sale + 1, 'eid': max_emp + 1})

# Serve static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    init_db()
    print(f'\n🚀 StockMaster corriendo en puerto {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
