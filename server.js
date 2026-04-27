const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new Database('stockmaster.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user TEXT UNIQUE NOT NULL,
    pass TEXT NOT NULL,
    role TEXT DEFAULT 'empleado',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cat TEXT,
    cost REAL DEFAULT 0,
    wholesale REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    minStock INTEGER DEFAULT 5
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    emp TEXT,
    empId INTEGER,
    items TEXT,
    total REAL DEFAULT 0,
    type TEXT DEFAULT 'venta',
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    stock INTEGER DEFAULT 0,
    sellPrice REAL DEFAULT 0,
    UNIQUE(empId, productId)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default data if empty
const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get();
if (empCount.count === 0) {
  // Seed employees
  const insertEmp = db.prepare('INSERT INTO employees (name, user, pass, role) VALUES (?, ?, ?, ?)');
  insertEmp.run('Juan Pérez', 'empleado', 'emp123', 'empleado');
  insertEmp.run('Admin', 'admin', 'admin123', 'admin');

  // Seed products
  const insertProd = db.prepare('INSERT INTO products (name, cat, cost, wholesale, stock, minStock) VALUES (?, ?, ?, ?, ?, ?)');
  insertProd.run('Camiseta básica', 'Ropa', 8, 12, 200, 10);
  insertProd.run('Pantalón casual', 'Ropa', 15, 22, 100, 5);
  insertProd.run('Audífonos Bluetooth', 'Electrónica', 25, 38, 50, 5);
  insertProd.run('Perfume 100ml', 'Belleza', 12, 18, 80, 10);
  insertProd.run('Mochila urbana', 'Accesorios', 20, 30, 60, 4);

  // Seed assignments
  const insertAssign = db.prepare('INSERT INTO assignments (empId, productId, stock, sellPrice) VALUES (?, ?, ?, ?)');
  insertAssign.run(1, 1, 30, 20);
  insertAssign.run(1, 3, 8, 60);

  // Seed sales
  const insertSale = db.prepare('INSERT INTO sales (date, emp, empId, items, total, type, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertSale.run('20/04/2025 10:30', 'Administrador', 0, JSON.stringify([{name:'Camiseta básica',qty:2,price:20,pid:1}]), 40, 'venta', '');
  insertSale.run('21/04/2025 14:00', 'Juan Pérez', 1, JSON.stringify([{name:'Audífonos Bluetooth',qty:1,price:60,pid:3}]), 60, 'venta', 'Cliente VIP');
  insertSale.run('22/04/2025 09:15', 'Juan Pérez', 1, JSON.stringify([{name:'Perfume 100ml',qty:1,price:30,pid:4}]), 30, 'reembolso', 'Producto dañado');

  console.log('✅ Default data seeded');
}

// ===================== API ROUTES =====================

// Employees
app.get('/api/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees').all();
  res.json(employees);
});

app.get('/api/employees/:id', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(employee || null);
});

app.post('/api/employees', (req, res) => {
  const { name, user, pass, role } = req.body;
  try {
    const result = db.prepare('INSERT INTO employees (name, user, pass, role) VALUES (?, ?, ?, ?)').run(name, user, pass, role || 'empleado');
    res.json({ id: result.lastInsertRowid, name, user, pass, role: role || 'empleado' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/employees/:id', (req, res) => {
  const { name, user, pass, role } = req.body;
  db.prepare('UPDATE employees SET name = ?, user = ?, pass = ?, role = ? WHERE id = ?').run(name, user, pass, role, req.params.id);
  res.json({ id: parseInt(req.params.id), name, user, pass, role });
});

app.delete('/api/employees/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM assignments WHERE empId = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/employees/user/:username', (req, res) => {
  const employee = db.prepare('SELECT * FROM employees WHERE user = ?').get(req.params.username);
  res.json(employee || null);
});

// Products
app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json(product || null);
});

app.post('/api/products', (req, res) => {
  const { name, cat, cost, wholesale, stock, minStock } = req.body;
  const result = db.prepare('INSERT INTO products (name, cat, cost, wholesale, stock, minStock) VALUES (?, ?, ?, ?, ?, ?)').run(name, cat, cost, wholesale, stock, minStock);
  res.json({ id: result.lastInsertRowid, name, cat, cost, wholesale, stock, minStock });
});

app.put('/api/products/:id', (req, res) => {
  const { name, cat, cost, wholesale, stock, minStock } = req.body;
  db.prepare('UPDATE products SET name = ?, cat = ?, cost = ?, wholesale = ?, stock = ?, minStock = ? WHERE id = ?').run(name, cat, cost, wholesale, stock, minStock, req.params.id);
  res.json({ id: parseInt(req.params.id), name, cat, cost, wholesale, stock, minStock });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM assignments WHERE productId = ?').run(req.params.id);
  res.json({ success: true });
});

// Sales
app.get('/api/sales', (req, res) => {
  const sales = db.prepare('SELECT * FROM sales ORDER BY id DESC').all();
  const parsed = sales.map(s => ({ ...s, items: JSON.parse(s.items) }));
  res.json(parsed);
});

app.post('/api/sales', (req, res) => {
  const { date, emp, empId, items, total, type, note } = req.body;
  const result = db.prepare('INSERT INTO sales (date, emp, empId, items, total, type, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(date, emp, empId, JSON.stringify(items), total, type, note);
  res.json({ id: result.lastInsertRowid, date, emp, empId, items, total, type, note });
});

// Assignments
app.get('/api/assignments', (req, res) => {
  const assignments = db.prepare('SELECT * FROM assignments').all();
  res.json(assignments);
});

app.get('/api/assignments/employee/:empId', (req, res) => {
  const assignments = db.prepare('SELECT * FROM assignments WHERE empId = ?').all(req.params.empId);
  res.json(assignments);
});

app.post('/api/assignments', (req, res) => {
  const { empId, productId, stock, sellPrice } = req.body;
  db.prepare('INSERT OR REPLACE INTO assignments (empId, productId, stock, sellPrice) VALUES (?, ?, ?, ?)').run(empId, productId, stock, sellPrice);
  res.json({ empId, productId, stock, sellPrice });
});

app.delete('/api/assignments/:empId/:productId', (req, res) => {
  const { empId, productId } = req.params;
  db.prepare('DELETE FROM assignments WHERE empId = ? AND productId = ?').run(empId, productId);
  res.json({ success: true });
});

// Get next IDs
app.get('/api/nextids', (req, res) => {
  const maxProd = db.prepare('SELECT MAX(id) as max FROM products').get();
  const maxSale = db.prepare('SELECT MAX(id) as max FROM sales').get();
  const maxEmp = db.prepare('SELECT MAX(id) as max FROM employees').get();
  res.json({
    pid: (maxProd.max || 0) + 1,
    sid: (maxSale.max || 0) + 1,
    eid: (maxEmp.max || 0) + 1
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 StockMaster Server running on http://localhost:${PORT}`);
  console.log(`📁 Database: stockmaster.db\n`);
});