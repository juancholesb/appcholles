const API_URL = '/api';

// ===================== TOKEN =====================

function getToken() { return localStorage.getItem('sm_token') || ''; }
function setToken(t) { localStorage.setItem('sm_token', t); }
function clearToken() { localStorage.removeItem('sm_token'); }

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

async function apiGet(e) {
  const r = await fetch(API_URL + e, { headers: authHeaders() });
  if (r.status === 401) { logout(); return null; }
  return await r.json();
}
async function apiPost(e, d) {
  const r = await fetch(API_URL + e, { method: 'POST', headers: authHeaders(), body: JSON.stringify(d) });
  if (r.status === 401) { logout(); return null; }
  return await r.json();
}
async function apiPut(e, d) {
  const r = await fetch(API_URL + e, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(d) });
  if (r.status === 401) { logout(); return null; }
  return await r.json();
}
async function apiDelete(e) {
  const r = await fetch(API_URL + e, { method: 'DELETE', headers: authHeaders() });
  if (r.status === 401) { logout(); return null; }
}

async function getAllEmployees(){return await apiGet('/employees');}
async function saveEmployeeDB(e){return e.id?await apiPut(`/employees/${e.id}`,e):await apiPost('/employees',e);}
async function deleteEmployeeDB(id){return await apiDelete(`/employees/${id}`);}
async function getAllProducts(){return await apiGet('/products');}
async function saveProductDB(p){return p.id?await apiPut(`/products/${p.id}`,p):await apiPost('/products',p);}
async function deleteProductDB(id){return await apiDelete(`/products/${id}`);}
async function getAllSalesAPI(){return await apiGet('/sales');}
async function saveSaleDB(s){return await apiPost('/sales',s);}
async function deleteAllSalesDB(){return await apiDelete('/sales/all');}
async function getAllAssignments(){return await apiGet('/assignments');}
async function saveAssignmentDB(a){return await apiPost('/assignments',a);}
async function deleteAssignmentDB(e,p){return await apiDelete(`/assignments/${e}/${p}`);}
async function getNextIds(){return await apiGet('/nextids');}

const state = {
  currentUser:null, editingProductId:null, cart:[], products:[],
  assignments:{}, sales:[], employees:[], editingVariants:[],
  pid:1, sid:1, eid:1,
};

function setRole(r){}

async function doLogin(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  if(!u||!p){toast('Ingresa usuario y contraseña','error');return;}

  try {
    const res = await fetch(API_URL + '/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({user: u, pass: p})
    });
    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Usuario o contraseña incorrectos', 'error');
      return;
    }

    setToken(data.token);
    state.currentUser = {name: data.name, role: data.role === 'admin' ? 'admin' : 'empleado', user: data.user, empId: data.id};
    await loadAppData();
    startApp();
  } catch(e) {
    toast('Error conectando al servidor', 'error');
  }
}

async function loadAppData() {
  const [employees, products, sales, assignments, nextIds] = await Promise.all([
    getAllEmployees(), getAllProducts(), getAllSalesAPI(), getAllAssignments(), getNextIds()
  ]);
  state.employees = (employees||[]).map(e=>({id:e.id,name:e.name,user:e.user,pass:e.pass,role:e.role||'empleado'}));
  state.products = (products||[]).map(p=>({id:p.id,name:p.name,cat:p.cat,cost:p.cost,
    wholesale:p.wholesale,stock:p.stock,minStock:p.minStock,variants:p.variants||[]}));
  state.sales = (sales||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));
  state.assignments = {};
  for(const a of (assignments||[])){
    if(!state.assignments[a.empId])state.assignments[a.empId]={};
    state.assignments[a.empId][a.productId]={stock:a.stock,sellPrice:a.sellPrice};
  }
  if(nextIds){state.pid=nextIds.pid;state.sid=nextIds.sid;state.eid=nextIds.eid;}
}

function startApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('topUser').textContent=state.currentUser.name;
  const rb=document.getElementById('topRole');
  rb.textContent=state.currentUser.role==='admin'?'👑 Admin':'👤 Usuario';
  rb.className='role-badge '+state.currentUser.role;
  buildSidebar();
  navigate(state.currentUser.role==='admin'?'dashboard':'nueva-venta');
}

function logout(){
  clearToken();
  state.currentUser=null; state.cart=[];
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
}

function buildSidebar(){
  const sb=document.getElementById('sidebar'); sb.innerHTML='';
  const isAdmin=state.currentUser.role==='admin';
  const items=isAdmin?[
    {s:'Principal'},{id:'dashboard',i:'📊',l:'Dashboard'},
    {s:'Inventario'},{id:'inventario',i:'📦',l:'Productos'},{id:'asignar',i:'🎯',l:'Asignar'},
    {s:'Gestión'},{id:'ventas',i:'🧾',l:'Ventas'},{id:'empleados',i:'👥',l:'Empleados'},
  ]:[
    {s:'Acciones'},{id:'nueva-venta',i:'🛍️',l:'Nueva Venta'},
    {id:'reembolsos',i:'↩️',l:'Reembolso'},{id:'mis-ventas',i:'📋',l:'Mis Ventas'},
  ];
  items.forEach(n=>{
    if(n.s){const d=document.createElement('div');d.className='nav-section';d.textContent=n.s;sb.appendChild(d);}
    else{const b=document.createElement('button');b.className='nav-item';b.dataset.page=n.id;
      b.innerHTML=`<span class="icon">${n.i}</span><span>${n.l}</span>`;b.onclick=()=>navigate(n.id);sb.appendChild(b);}
  });
}

function navigate(pid){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+pid); if(pg)pg.classList.add('active');
  const btn=document.querySelector(`[data-page="${pid}"]`); if(btn)btn.classList.add('active');
  const h={dashboard:renderDashboard,inventario:renderInventory,asignar:renderAssignPage,
    ventas:renderSales,empleados:renderEmployees,'nueva-venta':initNewSale,
    reembolsos:initRefund,'mis-ventas':renderMySales};
  if(h[pid])try{h[pid]();}catch(e){console.error(e);}
}

function renderDashboard(){
  const ventas=state.sales.filter(s=>s.type==='venta');
  const refunds=state.sales.filter(s=>s.type==='reembolso');
  const tv=ventas.reduce((a,s)=>a+s.total,0);
  const tr=refunds.reduce((a,s)=>a+s.total,0);
  const low=state.products.filter(p=>p.stock<=p.minStock).length;
  document.getElementById('stats').innerHTML=`
    <div class="stat-card purple"><div class="stat-label">Ventas totales</div><div class="stat-val">${cop(tv)}</div></div>
    <div class="stat-card red"><div class="stat-label">Reembolsos</div><div class="stat-val">${cop(tr)}</div></div>
    <div class="stat-card orange"><div class="stat-label">Stock bajo</div><div class="stat-val">${low}</div></div>
    <div class="stat-card green"><div class="stat-label">Productos</div><div class="stat-val">${state.products.length}</div></div>`;
  document.getElementById('dashSales').innerHTML=
    state.sales.slice(0,10).map(s=>`<tr>
      <td style="font-size:12px;color:var(--muted)">${s.date}</td><td>${s.emp}</td>
      <td style="font-size:12px">${s.items.map(i=>i.name+(i.variant?` (${i.variant})`:'')+' ×'+i.qty).join(', ')}</td>
      <td style="font-family:'Syne',sans-serif;font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
        ${s.type==='reembolso'?'-':''}${cop(s.total)}</td>
      <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
    </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--muted)">Sin registros</td></tr>';
}

function renderInventory(){
  const q=(document.getElementById('invSearch')?.value||'').toLowerCase();
  const f=state.products.filter(p=>p.name.toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q));
  document.getElementById('inventoryBody').innerHTML=f.length
    ?f.map(p=>{
      const sc=p.stock===0?'badge-low':p.stock<=p.minStock?'badge-warn':'badge-ok';
      const sl=p.stock===0?'Sin stock':p.stock<=p.minStock?'Stock bajo':'OK';
      const variants=p.variants||[];
      return `<tr>
        <td><strong>${p.name}</strong>${variants.length?`<br><span style="font-size:11px;color:var(--accent)">${variants.length} variante${variants.length>1?'s':''}: ${variants.join(', ')}</span>`:''}</td>
        <td><span style="color:var(--muted);font-size:12px">${p.cat}</span></td>
        <td><strong>$${p.cost.toFixed(2)}</strong></td>
        <td><strong>$${p.wholesale.toFixed(2)}</strong></td>
        <td><strong>${p.stock}</strong></td>
        <td><span class="badge ${sc}">${sl}</span></td>
        <td>
          <button class="btn btn-xs" onclick="openProductModal(${p.id})"
            style="color:var(--accent);border:1px solid rgba(108,99,255,.2);background:rgba(108,99,255,.08);margin-right:4px">✏️</button>
          <button class="btn btn-xs btn-danger" onclick="deleteProduct(${p.id})">🗑️</button>
        </td></tr>`;
    }).join('')
    :'<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Sin productos</td></tr>';
}

function openProductModal(id=null){
  state.editingProductId=id;
  document.getElementById('productModalTitle').textContent=id?'Editar Producto':'Agregar Producto';
  if(id){
    const p=state.products.find(x=>x.id===id);
    document.getElementById('pName').value=p.name;
    document.getElementById('pCat').value=p.cat;
    document.getElementById('pCost').value=p.cost;
    document.getElementById('pWholesale').value=p.wholesale;
    document.getElementById('pStock').value=p.stock;
    document.getElementById('pMinStock').value=p.minStock;
    state.editingVariants=[...(p.variants||[])];
  }else{
    ['pName','pCat','pCost','pWholesale','pStock'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('pMinStock').value=5;
    state.editingVariants=[];
  }
  renderVariantTags();
  document.getElementById('productModal').classList.add('open');
}

function renderVariantTags(){
  const el=document.getElementById('variantTags');
  if(!el)return;
  el.innerHTML=state.editingVariants.map((v,i)=>
    `<span class="variant-tag">${v}<button onclick="removeVariant(${i})">×</button></span>`
  ).join('');
}

function addVariant(){
  const inp=document.getElementById('variantInput');
  const v=inp.value.trim();
  if(!v)return;
  if(state.editingVariants.includes(v)){toast('Esa variante ya existe','error');return;}
  state.editingVariants.push(v);
  inp.value='';
  renderVariantTags();
}

function removeVariant(i){
  state.editingVariants.splice(i,1);
  renderVariantTags();
}

function calcGain(){}

async function saveProduct(){
  const name=document.getElementById('pName').value.trim();
  const cat=document.getElementById('pCat').value.trim();
  const cost=parseFloat(document.getElementById('pCost').value)||0;
  const wholesale=parseFloat(document.getElementById('pWholesale').value)||0;
  const stock=parseInt(document.getElementById('pStock').value)||0;
  const minStock=parseInt(document.getElementById('pMinStock').value)||5;
  const variants=[...state.editingVariants];
  if(!name){toast('El nombre es requerido','error');return;}
  if(state.editingProductId){
    const prod=state.products.find(x=>x.id===state.editingProductId);
    Object.assign(prod,{name,cat,cost,wholesale,stock,minStock,variants});
    await saveProductDB(prod);
    toast('Producto actualizado','success');
  }else{
    const newProd={name,cat,cost,wholesale,stock,minStock,variants};
    const saved=await saveProductDB(newProd);
    state.products.push({...newProd,id:saved.id});
    toast('Producto agregado','success');
  }
  closeModal('productModal');
  renderInventory();
}

async function deleteProduct(id){
  if(!confirm('¿Eliminar este producto?'))return;
  state.products=state.products.filter(p=>p.id!==id);
  await deleteProductDB(id);
  Object.keys(state.assignments).forEach(eid=>{delete state.assignments[eid][id];});
  renderInventory(); toast('Eliminado','success');
}

function renderAssignPage(){
  const sel=document.getElementById('assignEmpSel');
  const curVal=sel.value;
  sel.innerHTML='<option value="">-- Elige un empleado --</option>'+
    state.employees.filter(e=>e.role!=='admin').map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  if(curVal)sel.value=curVal;
  renderAssignTable();
}

function renderAssignTable(){
  const wrap=document.getElementById('assignTableWrap');
  const empId=parseInt(document.getElementById('assignEmpSel').value);
  if(!empId){wrap.innerHTML='';return;}
  const emp=state.employees.find(e=>e.id===empId);
  if(!emp){wrap.innerHTML='';return;}
  if(!state.assignments[empId])state.assignments[empId]={};
  const asgn=state.assignments[empId];
  let html=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-top:8px;">
    <div style="background:var(--surface2);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span style="font-family:'Syne',sans-serif;font-weight:700;">👤 ${emp.name}</span>
      <button class="btn btn-primary btn-sm" onclick="saveAssignments(${empId})">💾 Guardar</button>
    </div>
    <div style="overflow-x:auto;"><table class="assign-table">
      <thead><tr><th>Producto</th><th>Costo</th><th>Mayorista</th><th>Stock</th><th>Precio venta</th><th>Estado</th></tr></thead>
      <tbody>`;
  state.products.forEach(p=>{
    const a=asgn[p.id]||{stock:0,sellPrice:0};
    const sc=a.stock===0?'badge-low':a.stock<=p.minStock?'badge-warn':'badge-ok';
    const variants=p.variants||[];
    html+=`<tr style="${a.stock>0?'':'opacity:.55'}">
      <td><strong>${p.name}</strong>${variants.length?`<br><span style="font-size:10px;color:var(--accent)">${variants.length} variantes</span>`:''}
      </td>
      <td>$${p.cost.toFixed(2)}</td><td>$${p.wholesale.toFixed(2)}</td>
      <td><input type="number" min="0" max="${p.stock}" value="${a.stock}" id="asgn_stock_${empId}_${p.id}" />
        <div style="font-size:10px;color:var(--muted)">Disp: ${p.stock}</div></td>
      <td><input type="number" min="0" step="0.01" value="${a.sellPrice||''}" id="asgn_price_${empId}_${p.id}" placeholder="0.00" /></td>
      <td><span class="badge ${sc}">${a.stock} uds</span></td>
    </tr>`;
  });
  html+=`</tbody></table></div></div>`;
  wrap.innerHTML=html;
}

async function saveAssignments(empId){
  if(!state.assignments[empId])state.assignments[empId]={};
  let errors=[];
  for(const p of state.products){
    const stockEl=document.getElementById(`asgn_stock_${empId}_${p.id}`);
    const priceEl=document.getElementById(`asgn_price_${empId}_${p.id}`);
    const stock=parseInt(stockEl?.value)||0;
    const sellPrice=parseFloat(priceEl?.value)||0;
    if(stock>p.stock){errors.push(`${p.name}: stock insuficiente (máx ${p.stock})`);continue;}
    if(stock>0&&sellPrice===0){errors.push(`${p.name}: debes poner un precio`);continue;}
    state.assignments[empId][p.id]={stock,sellPrice};
    await saveAssignmentDB({empId:parseInt(empId),productId:p.id,stock,sellPrice});
  }
  if(errors.length){toast('⚠️ '+errors[0],'error');return;}
  toast(`✅ Guardado para ${state.employees.find(e=>e.id===empId)?.name}`,'success');
  renderAssignTable();
}

function renderSales(){
  const q=(document.getElementById('salesSearch')?.value||'').toLowerCase();
  const f=state.sales.filter(s=>s.emp.toLowerCase().includes(q)||s.items.some(i=>i.name.toLowerCase().includes(q)));
  document.getElementById('salesBody').innerHTML=
    f.map(s=>{
      const ganancia=s.items.reduce((a,i)=>{
        const p=state.products.find(x=>x.id===i.pid);
        return a+(i.price-(p?p.cost:0))*i.qty;
      },0);
      return `<tr>
        <td style="color:var(--muted)">#${s.id}</td>
        <td style="font-size:12px;color:var(--muted)">${s.date}</td>
        <td>${s.emp}</td>
        <td style="font-size:12px">${s.items.map(i=>`${i.name}${i.variant?` (${i.variant})`:''} ×${i.qty} @ ${cop(i.price)}`).join('<br>')}</td>
        <td style="font-family:'Syne',sans-serif;font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
          ${s.type==='reembolso'?'-':''}${cop(s.total)}</td>
        <td style="color:var(--success);font-weight:600">${s.type==='venta'?cop(ganancia):'—'}</td>
        <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
        <td style="font-size:12px;color:var(--muted)">${s.note||'—'}</td>
      </tr>`;
    }).join('')||
    '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">Sin registros</td></tr>';
}

async function deleteAllSales(){
  if(!confirm('¿Eliminar TODO el historial de ventas? Esta acción no se puede deshacer.'))return;
  await deleteAllSalesDB();
  state.sales=[];
  renderSales();
  toast('Historial eliminado','success');
}

function renderEmployees(){
  const wrap=document.getElementById('empCards');
  const emps=state.employees.filter(e=>e.role!=='admin');
  if(!emps.length){wrap.innerHTML='<div class="empty-state"><div class="icon">👥</div><p>No hay empleados.</p></div>';return;}
  wrap.innerHTML=emps.map(e=>{
    const sv=state.sales.filter(s=>s.empId===e.id&&s.type==='venta');
    const total=sv.reduce((a,s)=>a+s.total,0);
    const asgn=state.assignments[e.id]||{};
    const ap=state.products.filter(p=>asgn[p.id]&&asgn[p.id].stock>0);
    return `<div class="emp-stock-card">
      <div class="emp-stock-head">
        <div><div class="emp-stock-name">👤 ${e.name}</div>
          <div style="font-size:12px;color:var(--muted)">@${e.user} · ${sv.length} ventas · $${total.toFixed(2)}</div></div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-xs" onclick="navigate('asignar');setTimeout(()=>{document.getElementById('assignEmpSel').value=${e.id};renderAssignTable();},50)"
            style="color:var(--accent);border:1px solid rgba(108,99,255,.2);background:rgba(108,99,255,.08)">🎯 Asignar</button>
          <button class="btn btn-xs btn-danger" onclick="deleteEmployee(${e.id})">🗑️</button>
        </div>
      </div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:350px;">
        <thead><tr>
          <th style="padding:8px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;text-align:left;border-bottom:1px solid var(--border);">Producto</th>
          <th style="padding:8px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;text-align:left;border-bottom:1px solid var(--border);">Stock</th>
          <th style="padding:8px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;text-align:left;border-bottom:1px solid var(--border);">Precio</th>
          <th style="padding:8px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;text-align:left;border-bottom:1px solid var(--border);">Ganancia</th>
        </tr></thead>
        <tbody>${ap.length?ap.map(p=>{
          const a=asgn[p.id]; const gain=a.sellPrice-p.cost;
          const sc=a.stock===0?'badge-low':a.stock<=p.minStock?'badge-warn':'badge-ok';
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(42,42,61,.4)">
              <strong>${p.name}</strong>${(p.variants||[]).length?`<br><span style="font-size:10px;color:var(--muted)">${p.variants.length} variantes</span>`:''}
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid rgba(42,42,61,.4)"><span class="badge ${sc}">${a.stock}</span></td>
            <td style="padding:8px 12px;font-weight:700;border-bottom:1px solid rgba(42,42,61,.4)">$${a.sellPrice.toFixed(2)}</td>
            <td style="padding:8px 12px;color:${gain>=0?'var(--success)':'var(--danger)'};font-weight:600;border-bottom:1px solid rgba(42,42,61,.4)">$${gain.toFixed(2)}</td>
          </tr>`;}).join(''):`<tr><td colspan="4" style="padding:14px 12px;font-size:13px;color:var(--muted)">Sin productos asignados</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
  }).join('');
}

function openEmpModal(){
  ['eName','eUser','ePass'].forEach(f=>document.getElementById(f).value='');
  document.getElementById('empModal').classList.add('open');
}

async function saveEmployee(){
  const name=document.getElementById('eName').value.trim();
  const user=document.getElementById('eUser').value.trim();
  const pass=document.getElementById('ePass').value;
  if(!name||!user||!pass){toast('Todos los campos son requeridos','error');return;}
  if(state.employees.find(e=>e.user===user)){toast('Ese usuario ya existe','error');return;}
  const newEmp={name,user,pass,role:'empleado'};
  const saved=await saveEmployeeDB(newEmp);
  state.employees.push({...newEmp,id:saved.id});
  state.assignments[saved.id]={};
  toast('Empleado registrado','success');
  closeModal('empModal'); renderEmployees();
}

async function deleteEmployee(id){
  if(!confirm('¿Eliminar empleado?'))return;
  state.employees=state.employees.filter(e=>e.id!==id);
  delete state.assignments[id];
  await deleteEmployeeDB(id);
  renderEmployees(); toast('Eliminado','success');
}

function getMyAssignments(){
  const empId=state.currentUser.empId;
  const asgn=state.assignments[empId]||{};
  return state.products.filter(p=>asgn[p.id]&&asgn[p.id].stock>0).map(p=>({...p,...asgn[p.id]}));
}

function initNewSale(){
  state.cart=[]; renderCart();
  const myProducts=getMyAssignments();
  const sel=document.getElementById('pvProduct');
  if(sel){
    sel.innerHTML='<option value="">-- Selecciona --</option>'+
      myProducts.map(p=>`<option value="${p.id}">${p.name} (${p.stock} uds · $${p.sellPrice.toFixed(2)})</option>`).join('');
  }
  const noteEl=document.getElementById('pvNote'); if(noteEl)noteEl.value='';
  const priceEl=document.getElementById('pvPrice'); if(priceEl)priceEl.value='';
  const infoEl=document.getElementById('pvStockInfo'); if(infoEl)infoEl.textContent='';
  const varWrap=document.getElementById('pvVariantWrap'); if(varWrap)varWrap.style.display='none';
  const stockList=document.getElementById('empStockList');
  if(stockList){
    if(!myProducts.length){
      stockList.innerHTML='<div class="empty-state"><div class="icon">📦</div><p>El administrador aún no te ha asignado productos.</p></div>';
    }else{
      stockList.innerHTML=myProducts.map(p=>{
        const sc=p.stock===0?'badge-low':p.stock<=p.minStock?'badge-warn':'badge-ok';
        const variants=p.variants||[];
        return `<div style="padding:10px 14px;background:var(--bg);border-radius:8px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><strong>${p.name}</strong><br><span style="font-size:11px;color:var(--muted)">${p.cat}</span></div>
            <div style="text-align:right">
              <div style="font-family:'Syne',sans-serif;font-weight:700;color:var(--accent)">$${p.sellPrice.toFixed(2)}</div>
              <span class="badge ${sc}">${p.stock} uds</span>
            </div>
          </div>
          ${variants.length?`<div style="margin-top:6px;font-size:11px;color:var(--muted)">Variantes: <span style="color:var(--accent)">${variants.join(', ')}</span></div>`:''}
        </div>`;
      }).join('');
    }
  }
}

function onPvProductChange(){
  const sel=document.getElementById('pvProduct'); if(!sel)return;
  const pid=parseInt(sel.value);
  const empId=state.currentUser.empId;
  const asgn=state.assignments[empId]||{};
  const a=asgn[pid];
  const p=state.products.find(x=>x.id===pid);
  const priceEl=document.getElementById('pvPrice');
  const infoEl=document.getElementById('pvStockInfo');
  const varWrap=document.getElementById('pvVariantWrap');
  const varSel=document.getElementById('pvVariant');
  if(a&&priceEl){
    priceEl.value=Math.round(a.sellPrice);
    if(infoEl)infoEl.innerHTML=`
      <span style="color:var(--muted)">Stock: <strong style="color:var(--text)">${a.stock} uds</strong></span>
      &nbsp;·&nbsp;
      <span style="color:var(--muted)">Precio sugerido: <strong style="color:var(--accent)">${cop(a.sellPrice)}</strong></span>
      &nbsp;·&nbsp;
      <span style="color:var(--muted)">Mínimo (mayorista): <strong style="color:var(--danger)">${cop(p.wholesale)}</strong></span>`;
    const variants=p?.variants||[];
    if(variants.length>0){
      varWrap.style.display='block';
      varSel.innerHTML='<option value="">-- Selecciona variante --</option>'+
        variants.map(v=>`<option value="${v}">${v}</option>`).join('');
    }else{
      varWrap.style.display='none';
    }
  }else{
    if(priceEl)priceEl.value='';
    if(infoEl)infoEl.textContent='';
    if(varWrap)varWrap.style.display='none';
  }
}

function addToCart(){
  const sel=document.getElementById('pvProduct'); if(!sel)return;
  const pid=parseInt(sel.value);
  const qty=parseInt(document.getElementById('pvQty').value)||1;
  const price=parseFloat(document.getElementById('pvPrice').value)||0;
  const empId=state.currentUser.empId;
  const asgn=state.assignments[empId]||{};
  const a=asgn[pid];
  const p=state.products.find(x=>x.id===pid);
  if(!p||!a){toast('Selecciona un producto','error');return;}
  if(price<p.wholesale){
    toast(`❌ Precio mínimo: ${cop(p.wholesale)} (mayorista)`,'error');
    return;
  }
  const variants=p.variants||[];
  const varSel=document.getElementById('pvVariant');
  const variant=variants.length>0?(varSel?.value||''):'';
  if(variants.length>0&&!variant){toast('Selecciona una variante','error');return;}
  const cartKey=`${pid}_${variant}`;
  const inCart=state.cart.find(c=>c.cartKey===cartKey);
  const usedQty=inCart?.qty||0;
  if(qty+usedQty>a.stock){toast(`Stock insuficiente. Disponible: ${a.stock-usedQty}`,'error');return;}
  if(inCart){inCart.qty+=qty; inCart.price=price;}
  else state.cart.push({cartKey,id:pid,name:p.name,variant,qty,price,cost:p.cost,wholesale:p.wholesale});
  renderCart();
  sel.value='';
  document.getElementById('pvQty').value=1;
  document.getElementById('pvPrice').value='';
  const infoEl=document.getElementById('pvStockInfo'); if(infoEl)infoEl.textContent='';
  const varWrap=document.getElementById('pvVariantWrap'); if(varWrap)varWrap.style.display='none';
}

function removeFromCart(cartKey){
  state.cart=state.cart.filter(c=>c.cartKey!==cartKey); renderCart();
}

function renderCart(){
  const el=document.getElementById('cartItems');
  const totEl=document.getElementById('cartTotal');
  if(!el)return;
  if(!state.cart.length){
    el.innerHTML='<div class="empty-state"><div class="icon">🛒</div><p>Sin productos</p></div>';
    if(totEl)totEl.textContent='Total: $0'; return;
  }
  el.innerHTML=state.cart.map(c=>{
    const subtotal=c.qty*c.price;
    const ganancia=(c.price-c.cost)*c.qty;
    const gainColor=ganancia>=0?'var(--success)':'var(--danger)';
    return `
    <div class="cart-item">
      <div style="flex:1">
        <strong>${c.name}</strong>${c.variant?` <span style="font-size:11px;color:var(--accent)">(${c.variant})</span>`:''}<br>
        <span style="color:var(--muted);font-size:12px">×${c.qty} @ ${cop(c.price)}</span><br>
        <span style="font-size:11px;color:${gainColor}">Ganancia: ${cop(ganancia)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Syne',sans-serif;font-weight:700">${cop(subtotal)}</span>
        <button class="btn btn-xs btn-danger" onclick="removeFromCart('${c.cartKey}')">✕</button>
      </div>
    </div>`;
  }).join('');
  const tot=state.cart.reduce((a,c)=>a+c.qty*c.price,0);
  const gananciaTotal=state.cart.reduce((a,c)=>a+(c.price-c.cost)*c.qty,0);
  if(totEl)totEl.innerHTML=`Total: <strong>${cop(tot)}</strong> &nbsp;·&nbsp; Ganancia: <strong style="color:var(--success)">${cop(gananciaTotal)}</strong>`;
}

async function confirmSale(){
  if(!state.cart.length){toast('Agrega productos al carrito','error');return;}
  const noteEl=document.getElementById('pvNote');
  const note=noteEl?noteEl.value:'';
  const total=state.cart.reduce((a,c)=>a+c.qty*c.price,0);
  const empId=state.currentUser.empId;
  for(const c of state.cart){
    if(state.assignments[empId]&&state.assignments[empId][c.id]){
      state.assignments[empId][c.id].stock-=c.qty;
      await saveAssignmentDB({empId:parseInt(empId),productId:c.id,
        stock:state.assignments[empId][c.id].stock,sellPrice:state.assignments[empId][c.id].sellPrice});
    }
  }
  const newSale={date:now(),emp:state.currentUser.name,empId,
    items:state.cart.map(c=>({name:c.name,variant:c.variant||'',qty:c.qty,price:c.price,pid:c.id})),
    total,type:'venta',note};
  const saved=await saveSaleDB(newSale);
  state.sales.unshift({...newSale,id:saved.id});
  toast(`✅ Venta: $${total.toFixed(2)}`,'success');
  state.cart=[]; initNewSale();
}

function initRefund(){
  const rp=document.getElementById('refProduct'); if(!rp)return;
  const empId=state.currentUser.empId;
  const asgn=state.assignments[empId]||{};
  const myProducts=state.products.filter(p=>asgn[p.id]);
  rp.innerHTML='<option value="">-- Selecciona --</option>'+
    myProducts.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

async function confirmRefund(){
  const rp=document.getElementById('refProduct'); if(!rp)return;
  const id=parseInt(rp.value);
  const qty=parseInt(document.getElementById('refQty').value)||1;
  const reason=document.getElementById('refReason').value.trim();
  const amount=parseFloat(document.getElementById('refAmount').value)||0;
  if(!id){toast('Selecciona un producto','error');return;}
  if(!reason){toast('Indica el motivo','error');return;}
  const p=state.products.find(x=>x.id===id);
  const empId=state.currentUser.empId;
  if(state.assignments[empId]&&state.assignments[empId][id]){
    state.assignments[empId][id].stock+=qty;
    await saveAssignmentDB({empId:parseInt(empId),productId:id,
      stock:state.assignments[empId][id].stock,sellPrice:state.assignments[empId][id].sellPrice});
  }
  const newRefund={date:now(),emp:state.currentUser.name,empId,
    items:[{name:p?p.name:'Producto',variant:'',qty,price:amount,pid:id}],
    total:amount,type:'reembolso',note:reason};
  const saved=await saveSaleDB(newRefund);
  state.sales.unshift({...newRefund,id:saved.id});
  toast('Reembolso registrado','success');
  rp.value='';
  document.getElementById('refQty').value=1;
  document.getElementById('refReason').value='';
  document.getElementById('refAmount').value='';
}

function renderMySales(){
  const empId=state.currentUser.empId;
  const mine=state.sales.filter(s=>s.empId===empId);
  document.getElementById('mySalesBody').innerHTML=
    mine.map(s=>{
      const ganancia=s.items.reduce((a,i)=>{
        const p=state.products.find(x=>x.id===i.pid);
        return a+(i.price-(p?p.cost:0))*i.qty;
      },0);
      return `<tr>
        <td style="color:var(--muted)">#${s.id}</td>
        <td style="font-size:12px;color:var(--muted)">${s.date}</td>
        <td style="font-size:12px">${s.items.map(i=>`${i.name}${i.variant?` (${i.variant})`:''} ×${i.qty} @ ${cop(i.price)}`).join('<br>')}</td>
        <td style="font-family:'Syne',sans-serif;font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
          ${s.type==='reembolso'?'-':''}${cop(s.total)}</td>
        <td style="color:var(--success);font-weight:600">${s.type==='venta'?cop(ganancia):'—'}</td>
        <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
        <td style="font-size:12px;color:var(--muted)">${s.note||'—'}</td>
      </tr>`;
    }).join('')||
    '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Sin registros</td></tr>';
}

function cop(v){return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0}).format(v);}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function now(){const d=new Date();return d.toLocaleDateString('es-CO')+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});}
function toast(msg,type='success'){
  const el=document.createElement('div');el.className=`toast-item ${type}`;
  el.innerHTML=`${type==='success'?'✅':'❌'} ${msg}`;
  document.getElementById('toast').appendChild(el);setTimeout(()=>el.remove(),3500);
}

document.querySelectorAll('.modal-bg').forEach(bg=>
  bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open');})
);

async function initApp(){
  // Si hay token guardado, intentar restaurar sesión
  if(getToken()){
    try {
      await loadAppData();
      // No podemos restaurar currentUser sin guardar en localStorage también
      // así que simplemente limpiamos y pedimos login de nuevo
      clearToken();
    } catch(e) {}
  }
}
initApp();
