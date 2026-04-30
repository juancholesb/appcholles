const API_URL = '/api';

// ===================== TOKEN =====================
function getToken(){return localStorage.getItem('sm_token')||'';}
function setToken(t){localStorage.setItem('sm_token',t);}
function clearToken(){localStorage.removeItem('sm_token');}
function authHeaders(){return{'Content-Type':'application/json','Authorization':'Bearer '+getToken()};}

async function apiGet(e){
  const r=await fetch(API_URL+e,{headers:authHeaders()});
  if(r.status===401){logout();return null;}
  return await r.json();
}
async function apiPost(e,d){
  const r=await fetch(API_URL+e,{method:'POST',headers:authHeaders(),body:JSON.stringify(d)});
  if(r.status===401){logout();return null;}
  return await r.json();
}
async function apiPut(e,d){
  const r=await fetch(API_URL+e,{method:'PUT',headers:authHeaders(),body:JSON.stringify(d)});
  if(r.status===401){logout();return null;}
  return await r.json();
}
async function apiDelete(e){
  const r=await fetch(API_URL+e,{method:'DELETE',headers:authHeaders()});
  if(r.status===401){logout();return null;}
}

// ===================== API HELPERS =====================
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
async function getNextIds(){return await apiGet('/nextids');}
async function getGoalsAPI(){return await apiGet('/goals');}
async function saveGoalAPI(g){return await apiPost('/goals',g);}
async function getClientsAPI(){return await apiGet('/clients');}
async function getChangelogAPI(){return await apiGet('/changelog');}

// ===================== STATE =====================
const state = {
  currentUser:null, editingProductId:null, cart:[],
  products:[], sales:[], employees:[],
  assignments:{}, assignmentVariants:{},
  editingVariants:[],
  pid:1, sid:1, eid:1,
  goals:{}, // empId_month -> goal
  clients:[],
  lastReceipt:null,
};

// ===================== UTILS =====================
function cop(v){return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0,maximumFractionDigits:0}).format(v);}
function now(){const d=new Date();return d.toLocaleDateString('es-CO')+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});}
function todayStr(){return new Date().toISOString().split('T')[0];}
function currentMonth(){return new Date().toISOString().slice(0,7);}

function toast(msg,type='success'){
  const el=document.createElement('div');
  el.className=`toast-item ${type}`;
  const icon=type==='success'?'✅':type==='warn'?'⚠️':'❌';
  el.innerHTML=`<span>${icon}</span><span>${msg}</span>`;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),400);},3200);
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function calcGain(){}
function setRole(){}

// ===================== LOGIN =====================
async function doLogin(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  if(!u||!p){toast('Ingresa usuario y contraseña','error');return;}
  const btn=document.getElementById('loginBtn');
  btn.classList.add('loading');
  btn.disabled=true;
  try{
    const res=await fetch(API_URL+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:u,pass:p})});
    const data=await res.json();
    if(!res.ok){toast(data.error||'Usuario o contraseña incorrectos','error');return;}
    setToken(data.token);
    state.currentUser={name:data.name,role:data.role==='admin'?'admin':'empleado',user:data.user,empId:data.id};
    await loadAppData();
    startApp();
  }catch(e){toast('Error conectando al servidor','error');}
  finally{btn.classList.remove('loading');btn.disabled=false;}
}

async function loadAppData(){
  const [employees,products,sales,assignData,nextIds,goals,clients]=await Promise.all([
    getAllEmployees(),getAllProducts(),getAllSalesAPI(),getAllAssignments(),getNextIds(),
    getGoalsAPI(),getClientsAPI()
  ]);
  state.employees=(employees||[]).map(e=>({id:e.id,name:e.name,user:e.user,pass:e.pass,role:e.role||'empleado'}));
  state.products=(products||[]).map(p=>({
    id:p.id,name:p.name,cat:p.cat,cost:p.cost,
    wholesale:p.wholesale,stock:p.stock,minStock:p.minStock,
    variants:(p.variants||[])
  }));
  state.sales=(sales||[]).map(s=>({...s,items:typeof s.items==='string'?JSON.parse(s.items):s.items}));

  state.assignments={};
  state.assignmentVariants={};
  if(assignData){
    for(const a of (assignData.assignments||[])){
      if(!state.assignments[a.empId])state.assignments[a.empId]={};
      state.assignments[a.empId][a.productId]={sellPrice:a.sellPrice};
    }
    for(const av of (assignData.assignmentVariants||[])){
      if(!state.assignmentVariants[av.empId])state.assignmentVariants[av.empId]={};
      state.assignmentVariants[av.empId][av.variantId]={stock:av.stock,productId:av.productId};
    }
  }

  state.goals={};
  for(const g of (goals||[])){
    state.goals[`${g.empId}_${g.month}`]=g.goal;
  }

  state.clients=clients||[];
  if(nextIds){state.pid=nextIds.pid;state.sid=nextIds.sid;state.eid=nextIds.eid;}
}

function startApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  const cu=state.currentUser;
  document.getElementById('topUser').textContent=cu.name;
  const rb=document.getElementById('topRole');
  rb.textContent=cu.role==='admin'?'Admin':'Empleado';
  rb.className='role-badge '+(cu.role==='admin'?'admin':'emp');
  const av=document.getElementById('userAvatar');
  if(av)av.textContent=cu.name.charAt(0).toUpperCase();
  buildSidebar();
  navigate(cu.role==='admin'?'dashboard':'nueva-venta');
  renderStockAlerts();
}

function logout(){
  clearToken();
  state.currentUser=null;state.cart=[];
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
}

// ===================== SIDEBAR =====================
function buildSidebar(){
  const sb=document.getElementById('sidebarInner');sb.innerHTML='';
  const isAdmin=state.currentUser.role==='admin';
  const items=isAdmin?[
    {s:'Principal'},{id:'dashboard',i:'chart',l:'Dashboard'},
    {id:'cierre',i:'cash',l:'Cierre de Caja'},
    {s:'Inventario'},{id:'inventario',i:'box',l:'Productos'},{id:'asignar',i:'target',l:'Asignar'},
    {s:'Gestión'},{id:'ventas',i:'receipt',l:'Ventas'},{id:'empleados',i:'users',l:'Empleados'},
    {id:'metas',i:'flag',l:'Metas'},
    {s:'Más'},{id:'clientes-admin',i:'person',l:'Clientes'},{id:'changelog',i:'log',l:'Log de cambios'},
  ]:[
    {s:'Acciones'},{id:'nueva-venta',i:'cart',l:'Nueva Venta'},
    {id:'reembolsos',i:'undo',l:'Reembolso'},
    {s:'Mis Datos'},{id:'mis-ventas',i:'list',l:'Mis Ventas'},
    {id:'mis-clientes',i:'person',l:'Mis Clientes'},
  ];

  const icons={
    chart:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    cash:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    box:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`,
    target:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    receipt:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    users:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
    flag:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
    person:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    log:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    cart:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>`,
    undo:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
    list:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  };

  items.forEach(n=>{
    if(n.s){
      const d=document.createElement('div');
      d.className='nav-section';d.textContent=n.s;sb.appendChild(d);
    } else {
      const b=document.createElement('button');
      b.className='nav-item';b.dataset.page=n.id;
      b.innerHTML=`<span class="nav-icon">${icons[n.i]||''}</span><span>${n.l}</span>`;
      b.onclick=()=>{navigate(n.id);closeSidebar();};
      sb.appendChild(b);
    }
  });
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function navigate(pid){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+pid);if(pg)pg.classList.add('active');
  const btn=document.querySelector(`[data-page="${pid}"]`);if(btn)btn.classList.add('active');
  const h={
    dashboard:renderDashboard,inventario:renderInventory,asignar:renderAssignPage,
    ventas:renderSales,empleados:renderEmployees,'nueva-venta':initNewSale,
    reembolsos:initRefund,'mis-ventas':renderMySales,'mis-clientes':renderMyClients,
    cierre:initCierre,metas:renderMetas,'clientes-admin':renderClientsAdmin,
    changelog:renderChangelog
  };
  if(h[pid])try{h[pid]();}catch(e){console.error(e);}
}

// ===================== STOCK ALERTS =====================
function renderStockAlerts(){
  const el=document.getElementById('stockAlerts');if(!el)return;
  const low=state.products.filter(p=>{
    const v0=p.variants.filter(v=>v.stock===0);
    return p.stock<=p.minStock||v0.length;
  });
  if(!low.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="alert-pill" onclick="navigate('inventario')">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    ${low.length} producto${low.length>1?'s':''} con stock bajo
  </div>`;
}

// ===================== DASHBOARD =====================
function renderDashboard(){
  const ventas=state.sales.filter(s=>s.type==='venta');
  const refunds=state.sales.filter(s=>s.type==='reembolso');
  const tv=ventas.reduce((a,s)=>a+s.total,0);
  const tr=refunds.reduce((a,s)=>a+s.total,0);
  const low=state.products.filter(p=>p.stock<=p.minStock).length;
  const gananciaTotal=state.sales.filter(s=>s.type==='venta').reduce((a,s)=>{
    return a+s.items.reduce((b,i)=>{const p=state.products.find(x=>x.id===i.pid);return b+(i.price-(p?p.cost:0))*i.qty;},0);
  },0);

  document.getElementById('stats').innerHTML=`
    <div class="stat-card">
      <div class="stat-icon stat-icon-blue">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      </div>
      <div class="stat-body">
        <div class="stat-label">Ventas totales</div>
        <div class="stat-val">${cop(tv)}</div>
        <div class="stat-sub">${ventas.length} transacciones</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-green">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      </div>
      <div class="stat-body">
        <div class="stat-label">Ganancia neta</div>
        <div class="stat-val">${cop(gananciaTotal)}</div>
        <div class="stat-sub">Después de costos</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-red">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
      </div>
      <div class="stat-body">
        <div class="stat-label">Reembolsos</div>
        <div class="stat-val">${cop(tr)}</div>
        <div class="stat-sub">${refunds.length} reembolsos</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon stat-icon-orange">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      </div>
      <div class="stat-body">
        <div class="stat-label">Stock bajo</div>
        <div class="stat-val">${low}</div>
        <div class="stat-sub">productos críticos</div>
      </div>
    </div>`;

  renderSalesChart('week');
  renderRanking();

  document.getElementById('dashSales').innerHTML=
    state.sales.slice(0,8).map(s=>`
      <tr>
        <td style="font-size:12px;color:var(--muted)">${s.date}</td>
        <td><strong>${s.emp}</strong></td>
        <td style="font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
          ${s.type==='reembolso'?'−':''}${cop(s.total)}</td>
        <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
      </tr>`).join('')||
    '<tr><td colspan="4" class="empty-td">Sin registros</td></tr>';
}

function renderSalesChart(period){
  const days=period==='week'?7:30;
  const now=new Date();
  const labels=[];
  const data=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(now);d.setDate(d.getDate()-i);
    const label=d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit'});
    labels.push(label);
    const dayStr=d.toLocaleDateString('es-CO');
    const total=state.sales.filter(s=>s.type==='venta'&&s.date.startsWith(dayStr))
      .reduce((a,s)=>a+s.total,0);
    data.push(total);
  }
  const max=Math.max(...data,1);
  const chartEl=document.getElementById('salesChart');if(!chartEl)return;
  const skip=days>14?Math.ceil(days/10):1;
  chartEl.innerHTML=`
    <div class="bar-chart">
      ${data.map((v,i)=>{
        const h=Math.round((v/max)*100);
        const showLabel=i%skip===0;
        return`<div class="bar-col">
          <div class="bar-val">${v>0?cop(v):''}</div>
          <div class="bar" style="height:${h}%" title="${labels[i]}: ${cop(v)}">
            <div class="bar-fill"></div>
          </div>
          <div class="bar-label">${showLabel?labels[i]:''}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function switchChart(period,btn){
  document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderSalesChart(period);
}

function renderRanking(){
  const el=document.getElementById('empRanking');if(!el)return;
  const emps=state.employees.filter(e=>e.role!=='admin');
  const ranked=emps.map(e=>{
    const sv=state.sales.filter(s=>s.empId===e.id&&s.type==='venta');
    const total=sv.reduce((a,s)=>a+s.total,0);
    const gain=sv.reduce((a,s)=>a+s.items.reduce((b,i)=>{const p=state.products.find(x=>x.id===i.pid);return b+(i.price-(p?p.cost:0))*i.qty;},0),0);
    return{...e,total,count:sv.length,gain};
  }).sort((a,b)=>b.total-a.total);

  const medals=['🥇','🥈','🥉'];
  el.innerHTML=ranked.length?ranked.map((e,i)=>{
    const maxTotal=ranked[0].total||1;
    const pct=Math.round((e.total/maxTotal)*100);
    return`<div class="ranking-item">
      <div class="ranking-medal">${medals[i]||`#${i+1}`}</div>
      <div class="ranking-body">
        <div class="ranking-name">${e.name}</div>
        <div class="ranking-bar-wrap">
          <div class="ranking-bar" style="width:${pct}%"></div>
        </div>
        <div class="ranking-stats">${cop(e.total)} · ${e.count} ventas · ganancia ${cop(e.gain)}</div>
      </div>
    </div>`;
  }).join(''):'<div class="empty-state">Sin empleados</div>';
}

// ===================== CIERRE DE CAJA =====================
function initCierre(){
  const dateEl=document.getElementById('cierreDate');
  if(dateEl&&!dateEl.value)dateEl.value=todayStr();
  renderCierre();
}

function renderCierre(){
  const dateEl=document.getElementById('cierreDate');
  const selectedDate=dateEl?dateEl.value:'';
  const el=document.getElementById('cierreContent');if(!el)return;

  // Filtrar ventas del día seleccionado
  const dayStr=selectedDate?new Date(selectedDate+'T12:00:00').toLocaleDateString('es-CO'):'';
  const salesOfDay=state.sales.filter(s=>s.date.includes(dayStr.split('/')[0]+'/'+dayStr.split('/')[1]+'/'+dayStr.split('/')[2].slice(0,4)));

  // Filtro más robusto
  const daySales=state.sales.filter(s=>{
    if(!selectedDate)return false;
    const parts=selectedDate.split('-');
    const d=parseInt(parts[2]);const m=parseInt(parts[1]);const y=parseInt(parts[0]);
    const label=`${d.toString().padStart(2,'0')}/${m.toString().padStart(2,'0')}/${y}`;
    return s.date.startsWith(label)||s.date.includes(label);
  });

  const emps=state.employees.filter(e=>e.role!=='admin');
  if(!selectedDate){el.innerHTML='<div class="info-box">Selecciona una fecha para ver el cierre.</div>';return;}
  if(!daySales.length){el.innerHTML=`<div class="empty-state"><div class="icon">📭</div><p>Sin ventas registradas el ${selectedDate}</p></div>`;return;}

  let html='<div class="cierre-grid">';
  for(const emp of emps){
    const empSales=daySales.filter(s=>s.empId===emp.id&&s.type==='venta');
    const empRefunds=daySales.filter(s=>s.empId===emp.id&&s.type==='reembolso');
    if(!empSales.length&&!empRefunds.length)continue;
    const totalVentas=empSales.reduce((a,s)=>a+s.total,0);
    const totalRefunds=empRefunds.reduce((a,s)=>a+s.total,0);
    const ganancia=empSales.reduce((a,s)=>a+s.items.reduce((b,i)=>{const p=state.products.find(x=>x.id===i.pid);return b+(i.price-(p?p.cost:0))*i.qty;},0),0);

    // Productos más vendidos del día
    const prodCount={};
    empSales.forEach(s=>s.items.forEach(i=>{const k=i.name+(i.variant?` (${i.variant})`:'');prodCount[k]=(prodCount[k]||0)+i.qty;}));
    const topProds=Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,3);

    html+=`<div class="cierre-card">
      <div class="cierre-emp-name">👤 ${emp.name}</div>
      <div class="cierre-stats">
        <div class="cierre-stat">
          <div class="cierre-stat-label">Ventas</div>
          <div class="cierre-stat-val success">${cop(totalVentas)}</div>
          <div class="cierre-stat-sub">${empSales.length} transacciones</div>
        </div>
        <div class="cierre-stat">
          <div class="cierre-stat-label">Ganancia</div>
          <div class="cierre-stat-val accent">${cop(ganancia)}</div>
        </div>
        <div class="cierre-stat">
          <div class="cierre-stat-label">Reembolsos</div>
          <div class="cierre-stat-val danger">${cop(totalRefunds)}</div>
        </div>
      </div>
      ${topProds.length?`<div class="cierre-top-products">
        <div class="cierre-top-label">Top productos</div>
        ${topProds.map(([k,v])=>`<div class="cierre-prod-row"><span>${k}</span><span class="badge badge-ok">${v} uds</span></div>`).join('')}
      </div>`:''}
    </div>`;
  }
  html+='</div>';
  el.innerHTML=html;
}

// ===================== INVENTARIO =====================
function renderInventory(){
  const q=(document.getElementById('invSearch')?.value||'').toLowerCase();
  const f=state.products.filter(p=>p.name.toLowerCase().includes(q)||(p.cat||'').toLowerCase().includes(q));
  document.getElementById('inventoryBody').innerHTML=f.length
    ?f.map(p=>{
      const sc=p.stock===0?'badge-low':p.stock<=p.minStock?'badge-warn':'badge-ok';
      const sl=p.stock===0?'Sin stock':p.stock<=p.minStock?'Stock bajo':'OK';
      const varInfo=p.variants.length
        ?`<div class="variant-chips">${p.variants.map(v=>{
            const vc=v.stock===0?'chip-red':v.stock<=3?'chip-yellow':'chip-green';
            return`<span class="variant-chip ${vc}">${v.name}: ${v.stock}</span>`;
          }).join('')}</div>`:'';
      return`<tr>
        <td><strong>${p.name}</strong>${varInfo}</td>
        <td><span class="cat-tag">${p.cat}</span></td>
        <td class="num">${cop(p.cost)}</td>
        <td class="num">${cop(p.wholesale)}</td>
        <td class="num"><strong>${p.stock}</strong></td>
        <td><span class="badge ${sc}">${sl}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-icon btn-icon-edit" onclick="openProductModal(${p.id})" title="Editar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon btn-icon-del" onclick="deleteProduct(${p.id})" title="Eliminar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        </td></tr>`;
    }).join('')
    :'<tr><td colspan="7" class="empty-td">Sin productos</td></tr>';
  renderStockAlerts();
}

// ===================== MODAL PRODUCTO =====================
function openProductModal(id=null){
  state.editingProductId=id;
  document.getElementById('productModalTitle').textContent=id?'Editar Producto':'Agregar Producto';
  if(id){
    const p=state.products.find(x=>x.id===id);
    document.getElementById('pName').value=p.name;
    document.getElementById('pCat').value=p.cat||'';
    document.getElementById('pCost').value=p.cost;
    document.getElementById('pWholesale').value=p.wholesale;
    document.getElementById('pMinStock').value=p.minStock;
    state.editingVariants=p.variants.map(v=>({id:v.id,name:v.name,stock:v.stock}));
  }else{
    ['pName','pCat','pCost','pWholesale'].forEach(f=>document.getElementById(f).value='');
    document.getElementById('pMinStock').value=5;
    state.editingVariants=[];
  }
  renderVariantTags();
  document.getElementById('productModal').classList.add('open');
}

function renderVariantTags(){
  const el=document.getElementById('variantTags');if(!el)return;
  if(!state.editingVariants.length){
    el.innerHTML='<div class="hint-text" style="padding:8px 0">Sin variantes — agrega sabores, tallas, colores, etc.</div>';return;
  }
  el.innerHTML=`<table class="variant-table">
    <thead><tr><th>Variante</th><th>Stock</th><th></th></tr></thead>
    <tbody>${state.editingVariants.map((v,i)=>`
      <tr>
        <td><strong>${v.name}</strong></td>
        <td><input type="number" min="0" value="${v.stock}"
          onchange="state.editingVariants[${i}].stock=parseInt(this.value)||0"
          class="stock-input" /></td>
        <td><button class="btn-icon btn-icon-del" onclick="removeVariant(${i})">✕</button></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function addVariant(){
  const inp=document.getElementById('variantInput');
  const v=inp.value.trim();if(!v)return;
  if(state.editingVariants.find(x=>x.name.toLowerCase()===v.toLowerCase())){toast('Esa variante ya existe','error');return;}
  state.editingVariants.push({name:v,stock:0});
  inp.value='';renderVariantTags();
}
function removeVariant(i){state.editingVariants.splice(i,1);renderVariantTags();}

async function saveProduct(){
  const name=document.getElementById('pName').value.trim();
  const cat=document.getElementById('pCat').value.trim();
  const cost=parseFloat(document.getElementById('pCost').value)||0;
  const wholesale=parseFloat(document.getElementById('pWholesale').value)||0;
  const minStock=parseInt(document.getElementById('pMinStock').value)||5;
  if(!name){toast('El nombre es requerido','error');return;}
  if(!state.editingVariants.length){toast('Agrega al menos una variante','error');return;}
  const productData={name,cat,cost,wholesale,minStock,variants:state.editingVariants};
  if(state.editingProductId){
    productData.id=state.editingProductId;
    const saved=await saveProductDB(productData);
    const idx=state.products.findIndex(x=>x.id===state.editingProductId);
    if(idx>=0)state.products[idx]=saved;
    toast('Producto actualizado');
  }else{
    const saved=await saveProductDB(productData);
    state.products.push(saved);
    toast('Producto agregado');
  }
  closeModal('productModal');renderInventory();renderStockAlerts();
}

async function deleteProduct(id){
  if(!confirm('¿Eliminar este producto y todas sus variantes?'))return;
  state.products=state.products.filter(p=>p.id!==id);
  await deleteProductDB(id);
  renderInventory();toast('Eliminado');
}

// ===================== ASIGNAR =====================
function renderAssignPage(){
  const sel=document.getElementById('assignEmpSel');
  const curVal=sel.value;
  sel.innerHTML='<option value="">— Elige un empleado —</option>'+
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
  const asgn=state.assignments[empId]||{};
  const avMap=state.assignmentVariants[empId]||{};

  let html=`<div class="assign-card">
    <div class="assign-header">
      <span>👤 ${emp.name}</span>
      <button class="btn btn-primary btn-sm" onclick="saveAssignments(${empId})">💾 Guardar asignaciones</button>
    </div>
    <div class="assign-products">`;

  for(const p of state.products){
    const a=asgn[p.id]||{sellPrice:0};
    html+=`<div class="assign-product">
      <div class="assign-product-head">
        <div><strong>${p.name}</strong><span class="cat-tag" style="margin-left:8px">${p.cat}</span></div>
        <div class="assign-product-price">
          <span class="muted-sm">Costo: ${cop(p.cost)} · Mayorista: ${cop(p.wholesale)}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <label class="muted-sm">Precio venta:</label>
            <input type="number" min="${p.wholesale}" step="1" value="${a.sellPrice||''}"
              id="asgn_price_${empId}_${p.id}" placeholder="0"
              class="price-input" />
          </div>
        </div>
      </div>
      <div class="assign-variants">`;
    for(const v of p.variants){
      const av=avMap[v.id];
      const assignedStock=av?av.stock:0;
      const sc=assignedStock===0?'chip-red':assignedStock<=3?'chip-yellow':'chip-green';
      html+=`<div class="assign-variant-card">
        <div class="av-name">${v.name}</div>
        <div class="av-total">Total: ${v.stock}</div>
        <div class="av-assign">
          <label>Asignar:</label>
          <input type="number" min="0" max="${v.stock}" value="${assignedStock}"
            id="asgn_var_${empId}_${v.id}" class="stock-input" />
        </div>
        <div class="variant-chip ${sc}" style="margin-top:4px">Asignado: ${assignedStock}</div>
      </div>`;
    }
    html+=`</div></div>`;
  }
  html+=`</div></div>`;
  wrap.innerHTML=html;
}

async function saveAssignments(empId){
  if(!state.assignments[empId])state.assignments[empId]={};
  if(!state.assignmentVariants[empId])state.assignmentVariants[empId]={};
  let errors=[];
  for(const p of state.products){
    const priceEl=document.getElementById(`asgn_price_${empId}_${p.id}`);
    const sellPrice=parseFloat(priceEl?.value)||0;
    if(sellPrice>0&&sellPrice<p.wholesale){errors.push(`${p.name}: precio mín. ${cop(p.wholesale)}`);continue;}
    const variantsData=[];
    let ok=true;
    for(const v of p.variants){
      const stockEl=document.getElementById(`asgn_var_${empId}_${v.id}`);
      const stock=parseInt(stockEl?.value)||0;
      if(stock>v.stock){errors.push(`${p.name} - ${v.name}: máx ${v.stock}`);ok=false;continue;}
      variantsData.push({variantId:v.id,stock});
      state.assignmentVariants[empId][v.id]={stock,productId:p.id};
    }
    if(!ok)continue;
    if(variantsData.some(v=>v.stock>0)||sellPrice>0){
      state.assignments[empId][p.id]={sellPrice};
      await saveAssignmentDB({empId:parseInt(empId),productId:p.id,sellPrice,variants:variantsData});
    }
  }
  if(errors.length){toast('⚠️ '+errors[0],'error');return;}
  toast(`Asignaciones guardadas para ${state.employees.find(e=>e.id===empId)?.name}`);
  renderAssignTable();
}

// ===================== VENTAS ADMIN =====================
function renderSales(){
  const q=(document.getElementById('salesSearch')?.value||'').toLowerCase();
  const f=state.sales.filter(s=>s.emp.toLowerCase().includes(q)||s.items.some(i=>i.name.toLowerCase().includes(q)));
  document.getElementById('salesBody').innerHTML=
    f.map(s=>{
      const ganancia=s.items.reduce((a,i)=>{const p=state.products.find(x=>x.id===i.pid);return a+(i.price-(p?p.cost:0))*i.qty;},0);
      return`<tr>
        <td class="muted-td">#${s.id}</td>
        <td class="date-td">${s.date}</td>
        <td><strong>${s.emp}</strong></td>
        <td class="muted-td">${s.clientName||'—'}</td>
        <td class="items-td">${s.items.map(i=>`${i.name}${i.variant?` (${i.variant})`:''} ×${i.qty}`).join(', ')}</td>
        <td class="muted-td">${s.discount?s.discount+'%':'—'}</td>
        <td style="font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
          ${s.type==='reembolso'?'−':''}${cop(s.total)}</td>
        <td style="color:var(--success)">${s.type==='venta'?cop(ganancia):'—'}</td>
        <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
        <td class="muted-td">${s.note||'—'}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="10" class="empty-td">Sin registros</td></tr>';
}

function deleteAllSales(){document.getElementById('deleteModal').classList.add('open');}

async function confirmDeleteAll(){
  await deleteAllSalesDB();
  state.sales=[];
  closeModal('deleteModal');
  renderSales();
  if(document.getElementById('page-dashboard').classList.contains('active'))renderDashboard();
  toast('Historial eliminado');
}

// ===================== EMPLEADOS =====================
function renderEmployees(){
  const wrap=document.getElementById('empCards');
  const emps=state.employees.filter(e=>e.role!=='admin');
  if(!emps.length){wrap.innerHTML='<div class="empty-state"><div class="icon">👥</div><p>No hay empleados.</p></div>';return;}
  wrap.innerHTML=emps.map(e=>{
    const sv=state.sales.filter(s=>s.empId===e.id&&s.type==='venta');
    const total=sv.reduce((a,s)=>a+s.total,0);
    const asgn=state.assignments[e.id]||{};
    const avMap=state.assignmentVariants[e.id]||{};
    const assignedProds=state.products.filter(p=>asgn[p.id]&&asgn[p.id].sellPrice>0);
    const month=currentMonth();
    const goalKey=`${e.id}_${month}`;
    const goal=state.goals[goalKey]||0;
    const monthSales=state.sales.filter(s=>s.empId===e.id&&s.type==='venta'&&s.date.includes('/'+month.slice(0,4)));
    const monthTotal=monthSales.reduce((a,s)=>a+s.total,0);
    const pct=goal>0?Math.min(Math.round((monthTotal/goal)*100),100):0;

    return`<div class="emp-card">
      <div class="emp-card-head">
        <div class="emp-avatar">${e.name.charAt(0).toUpperCase()}</div>
        <div class="emp-info">
          <div class="emp-name">${e.name}</div>
          <div class="emp-user">@${e.user} · ${sv.length} ventas · ${cop(total)}</div>
          ${goal?`<div class="emp-goal-bar-wrap">
            <div class="emp-goal-bar" style="width:${pct}%"></div>
          </div>
          <div class="emp-goal-label">Meta ${month}: ${pct}% (${cop(monthTotal)} / ${cop(goal)})</div>`:''}
        </div>
        <div class="emp-actions">
          <button class="btn btn-ghost btn-sm" onclick="openGoalModal(${e.id},'${e.name}')">🎯 Meta</button>
          <button class="btn btn-ghost btn-sm" onclick="navigate('asignar');setTimeout(()=>{document.getElementById('assignEmpSel').value=${e.id};renderAssignTable();},50)">📦 Asignar</button>
          <button class="btn-icon btn-icon-del" onclick="deleteEmployee(${e.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
          </button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Producto / Variante</th><th>Stock</th><th>P. Venta</th><th>Ganancia</th></tr></thead>
          <tbody>${assignedProds.length?assignedProds.map(p=>{
            const a=asgn[p.id];const gain=a.sellPrice-p.cost;
            return`<tr style="background:rgba(99,102,241,.04)">
              <td><strong>${p.name}</strong></td>
              <td colspan="3" class="muted-td">${p.variants.reduce((s,v)=>{const av=avMap[v.id];return s+(av?av.stock:0);},0)} uds total</td>
            </tr>`+p.variants.map(v=>{
              const av=avMap[v.id];const vs=av?av.stock:0;
              const sc=vs===0?'badge-low':vs<=3?'badge-warn':'badge-ok';
              return`<tr>
                <td style="padding-left:24px;color:var(--muted)">↳ ${v.name}</td>
                <td><span class="badge ${sc}">${vs}</span></td>
                <td class="num">${cop(a.sellPrice)}</td>
                <td style="color:${gain>=0?'var(--success)':'var(--danger)'}">${cop(gain)}</td>
              </tr>`;
            }).join('');
          }).join(''):`<tr><td colspan="4" class="muted-td">Sin productos asignados</td></tr>`}
          </tbody>
        </table>
      </div>
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
  const saved=await saveEmployeeDB({name,user,pass,role:'empleado'});
  state.employees.push({name,user,pass:saved.pass||pass,id:saved.id,role:'empleado'});
  state.assignments[saved.id]={};state.assignmentVariants[saved.id]={};
  toast('Empleado registrado');closeModal('empModal');renderEmployees();
}

async function deleteEmployee(id){
  if(!confirm('¿Eliminar empleado?'))return;
  state.employees=state.employees.filter(e=>e.id!==id);
  delete state.assignments[id];delete state.assignmentVariants[id];
  await deleteEmployeeDB(id);renderEmployees();toast('Eliminado');
}

// ===================== METAS =====================
function renderMetas(){
  const el=document.getElementById('metasContent');if(!el)return;
  const emps=state.employees.filter(e=>e.role!=='admin');
  const month=currentMonth();
  el.innerHTML=`<div class="metas-grid">${emps.map(e=>{
    const goalKey=`${e.id}_${month}`;
    const goal=state.goals[goalKey]||0;
    const sv=state.sales.filter(s=>s.empId===e.id&&s.type==='venta');
    const monthSales=sv.filter(s=>{
      const parts=month.split('-');
      return s.date.includes(parts[1]+'/'+parts[0]);
    });
    const monthTotal=monthSales.reduce((a,s)=>a+s.total,0);
    const pct=goal>0?Math.min(Math.round((monthTotal/goal)*100),100):0;
    return`<div class="meta-card">
      <div class="meta-emp">${e.name}</div>
      <div class="meta-month">${month}</div>
      ${goal?`<div class="meta-progress">
        <div class="meta-bar-wrap">
          <div class="meta-bar" style="width:${pct}%"></div>
        </div>
        <div class="meta-nums">${cop(monthTotal)} / ${cop(goal)}</div>
        <div class="meta-pct ${pct>=100?'pct-done':''}">${pct}% ${pct>=100?'🎉 ¡Meta cumplida!':pct>=70?'🔥 Casi':'💪 En progreso'}</div>
      </div>`:`<div class="meta-empty">Sin meta establecida</div>`}
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="openGoalModal(${e.id},'${e.name}')">
        ${goal?'✏️ Editar meta':'+ Establecer meta'}
      </button>
    </div>`;
  }).join('')}</div>`;
}

let _goalEmpId=null;
function openGoalModal(empId,empName){
  _goalEmpId=empId;
  document.getElementById('goalEmpName').value=empName;
  document.getElementById('goalMonth').value=currentMonth();
  const existing=state.goals[`${empId}_${currentMonth()}`]||0;
  document.getElementById('goalAmount').value=existing||'';
  document.getElementById('goalModal').classList.add('open');
}

async function saveGoal(){
  const month=document.getElementById('goalMonth').value;
  const goal=parseFloat(document.getElementById('goalAmount').value)||0;
  if(!goal){toast('Ingresa un monto de meta','error');return;}
  await saveGoalAPI({empId:_goalEmpId,month,goal});
  state.goals[`${_goalEmpId}_${month}`]=goal;
  toast('Meta guardada');closeModal('goalModal');
  renderEmployees();renderMetas();
}

// ===================== CLIENTES ADMIN =====================
async function renderClientsAdmin(){
  const clients=await getClientsAPI();
  state.clients=clients||[];
  const el=document.getElementById('clientsBody');if(!el)return;
  const empMap={};state.employees.forEach(e=>empMap[e.id]=e.name);
  el.innerHTML=state.clients.map(c=>`
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone||'—'}</td>
      <td>${empMap[c.empId]||'—'}</td>
      <td class="muted-td">${c.lastSale||'—'}</td>
      <td style="color:var(--success);font-weight:600">${cop(c.totalPurchases)}</td>
    </tr>`).join('')||'<tr><td colspan="5" class="empty-td">Sin clientes registrados</td></tr>';
}

// ===================== CHANGELOG =====================
async function renderChangelog(){
  const logs=await getChangelogAPI();
  const el=document.getElementById('changelogBody');if(!el)return;
  const actionColors={CREATE:'var(--success)',UPDATE:'var(--accent)',DELETE:'var(--danger)',LOGIN:'var(--muted)',ASSIGN:'var(--warn)'};
  el.innerHTML=(logs||[]).map(l=>`
    <tr>
      <td class="muted-td date-td">${new Date(l.createdAt).toLocaleString('es-CO')}</td>
      <td><strong>${l.empName||'—'}</strong></td>
      <td><span style="color:${actionColors[l.action]||'var(--text)'};font-weight:600">${l.action}</span></td>
      <td class="muted-td">${l.entity||'—'}</td>
      <td class="muted-td">${l.detail||'—'}</td>
    </tr>`).join('')||'<tr><td colspan="5" class="empty-td">Sin registros</td></tr>';
}

// ===================== NUEVA VENTA =====================
function getMyAssignedProducts(){
  const empId=state.currentUser.empId;
  const asgn=state.assignments[empId]||{};
  const avMap=state.assignmentVariants[empId]||{};
  return state.products
    .filter(p=>asgn[p.id]&&asgn[p.id].sellPrice>0)
    .map(p=>({
      ...p,sellPrice:asgn[p.id].sellPrice,
      variants:p.variants.map(v=>({...v,assignedStock:(avMap[v.id]?avMap[v.id].stock:0)})).filter(v=>v.assignedStock>0)
    })).filter(p=>p.variants.length>0);
}

function initNewSale(){
  state.cart=[];renderCart();
  const myProducts=getMyAssignedProducts();
  const sel=document.getElementById('pvProduct');
  if(sel){
    sel.innerHTML='<option value="">— Selecciona producto —</option>'+
      myProducts.map(p=>`<option value="${p.id}">${p.name} — ${cop(p.sellPrice)}</option>`).join('');
  }
  ['pvNote','pvPrice','pvClientName','pvClientPhone'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('pvDiscount').value=0;
  const infoEl=document.getElementById('pvStockInfo');if(infoEl)infoEl.textContent='';
  const varWrap=document.getElementById('pvVariantWrap');if(varWrap)varWrap.style.display='none';
  renderEmpInventory(myProducts);
  renderMyGoalCard();
  loadClientSuggestions();
}

function loadClientSuggestions(){
  const empId=state.currentUser.empId;
  const myClients=state.clients.filter(c=>c.empId===empId);
  const dl=document.getElementById('clientSuggestions');
  if(dl)dl.innerHTML=myClients.map(c=>`<option value="${c.name}" data-phone="${c.phone||''}">`).join('');
}

function filterClientSuggestions(){
  const nameEl=document.getElementById('pvClientName');
  const phoneEl=document.getElementById('pvClientPhone');
  if(!nameEl||!phoneEl)return;
  const empId=state.currentUser.empId;
  const found=state.clients.find(c=>c.empId===empId&&c.name===nameEl.value);
  if(found&&found.phone)phoneEl.value=found.phone;
}

function renderEmpInventory(myProducts){
  const stockList=document.getElementById('empStockList');
  if(!stockList)return;
  if(!myProducts.length){
    stockList.innerHTML='<div class="empty-state"><div class="icon">📦</div><p>El administrador aún no te ha asignado productos.</p></div>';return;
  }
  stockList.innerHTML=myProducts.map(p=>`
    <div class="inv-product-card">
      <div class="inv-product-head">
        <div><strong>${p.name}</strong><br><span class="muted-sm">${p.cat}</span></div>
        <div class="inv-price">${cop(p.sellPrice)}</div>
      </div>
      <div class="variant-chips">
        ${p.variants.map(v=>{
          const sc=v.assignedStock===0?'chip-red':v.assignedStock<=3?'chip-yellow':'chip-green';
          return`<span class="variant-chip ${sc}">${v.name}: ${v.assignedStock}</span>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function renderMyGoalCard(){
  const el=document.getElementById('myGoalCard');if(!el)return;
  const empId=state.currentUser.empId;
  const month=currentMonth();
  const goal=state.goals[`${empId}_${month}`]||0;
  if(!goal){el.innerHTML='';return;}
  const sv=state.sales.filter(s=>s.empId===empId&&s.type==='venta');
  const parts=month.split('-');
  const monthSales=sv.filter(s=>s.date.includes(parts[1]+'/'+parts[0]));
  const monthTotal=monthSales.reduce((a,s)=>a+s.total,0);
  const pct=Math.min(Math.round((monthTotal/goal)*100),100);
  const falta=Math.max(goal-monthTotal,0);
  el.innerHTML=`<h4 class="card-title">🎯 Meta del mes</h4>
    <div class="goal-progress-wrap">
      <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
      <div class="goal-info">
        <span class="goal-pct">${pct}%</span>
        <span class="goal-nums">${cop(monthTotal)} / ${cop(goal)}</span>
      </div>
      ${falta>0?`<div class="goal-falta">Te faltan <strong>${cop(falta)}</strong> para la meta 💪</div>`:
        '<div class="goal-done">🎉 ¡Meta del mes cumplida!</div>'}
    </div>`;
}

function updateDiscountPreview(){
  const price=parseFloat(document.getElementById('pvPrice').value)||0;
  const qty=parseInt(document.getElementById('pvQty').value)||1;
  const disc=parseFloat(document.getElementById('pvDiscount').value)||0;
  const el=document.getElementById('discountPreview');if(!el)return;
  if(!disc||!price){el.textContent='';return;}
  const original=price*qty;
  const descuento=original*(disc/100);
  const final=original-descuento;
  el.textContent=`Original: ${cop(original)} → Descuento: ${cop(descuento)} → Final: ${cop(final)}`;
}

function onPvProductChange(){
  const sel=document.getElementById('pvProduct');if(!sel)return;
  const pid=parseInt(sel.value);
  const myProducts=getMyAssignedProducts();
  const p=myProducts.find(x=>x.id===pid);
  const priceEl=document.getElementById('pvPrice');
  const infoEl=document.getElementById('pvStockInfo');
  const varWrap=document.getElementById('pvVariantWrap');
  const varSel=document.getElementById('pvVariant');
  if(p&&priceEl){
    priceEl.value=Math.round(p.sellPrice);
    if(infoEl)infoEl.innerHTML=`<span>Precio sugerido: <strong style="color:var(--accent)">${cop(p.sellPrice)}</strong></span>
      <span>Mínimo: <strong style="color:var(--danger)">${cop(p.wholesale)}</strong></span>`;
    varWrap.style.display='block';
    varSel.innerHTML='<option value="">— Selecciona variante —</option>'+
      p.variants.map(v=>{
        const sc=v.assignedStock===0?' 🔴':v.assignedStock<=3?' 🟡':' 🟢';
        return`<option value="${v.id}" ${v.assignedStock===0?'disabled':''}>${sc} ${v.name} — ${v.assignedStock} disp.</option>`;
      }).join('');
  }else{
    if(priceEl)priceEl.value='';
    if(infoEl)infoEl.textContent='';
    if(varWrap)varWrap.style.display='none';
  }
}

function onPvVariantChange(){
  const varSel=document.getElementById('pvVariant');
  const infoEl=document.getElementById('pvStockInfo');if(!varSel||!infoEl)return;
  const vid=parseInt(varSel.value);
  const pid=parseInt(document.getElementById('pvProduct')?.value);
  const p=getMyAssignedProducts().find(x=>x.id===pid);if(!p)return;
  const v=p.variants.find(x=>x.id===vid);if(!v)return;
  infoEl.innerHTML=`<span>Precio sugerido: <strong style="color:var(--accent)">${cop(p.sellPrice)}</strong></span>
    <span>Mínimo: <strong style="color:var(--danger)">${cop(p.wholesale)}</strong></span>
    <span>Stock <strong>${v.name}</strong>: <strong>${v.assignedStock} uds</strong></span>`;
}

function addToCart(){
  const pid=parseInt(document.getElementById('pvProduct')?.value);
  const vid=parseInt(document.getElementById('pvVariant')?.value);
  const qty=parseInt(document.getElementById('pvQty').value)||1;
  const price=parseFloat(document.getElementById('pvPrice').value)||0;
  const discount=parseFloat(document.getElementById('pvDiscount').value)||0;
  const myProducts=getMyAssignedProducts();
  const p=myProducts.find(x=>x.id===pid);
  if(!p){toast('Selecciona un producto','error');return;}
  if(!vid){toast('Selecciona una variante','error');return;}
  const v=p.variants.find(x=>x.id===vid);
  if(!v){toast('Variante no encontrada','error');return;}
  if(price<p.wholesale){toast(`Precio mínimo: ${cop(p.wholesale)}`,'error');return;}
  const cartKey=`${pid}_${vid}`;
  const inCart=state.cart.find(c=>c.cartKey===cartKey);
  const usedQty=inCart?.qty||0;
  if(qty+usedQty>v.assignedStock){toast(`Stock insuficiente. Disponible: ${v.assignedStock-usedQty}`,'error');return;}
  const finalPrice=price*(1-(discount/100));
  if(inCart){inCart.qty+=qty;inCart.price=finalPrice;inCart.discount=discount;}
  else state.cart.push({cartKey,id:pid,variantId:vid,name:p.name,variant:v.name,qty,price:finalPrice,originalPrice:price,discount,cost:p.cost,wholesale:p.wholesale});
  renderCart();
  document.getElementById('pvProduct').value='';
  document.getElementById('pvVariant').value='';
  document.getElementById('pvQty').value=1;
  document.getElementById('pvPrice').value='';
  document.getElementById('pvDiscount').value=0;
  document.getElementById('pvStockInfo').textContent='';
  document.getElementById('pvVariantWrap').style.display='none';
  document.getElementById('discountPreview').textContent='';
  document.getElementById('cartCount').textContent=state.cart.reduce((a,c)=>a+c.qty,0);
}

function removeFromCart(cartKey){state.cart=state.cart.filter(c=>c.cartKey!==cartKey);renderCart();}

function renderCart(){
  const el=document.getElementById('cartItems');
  const totEl=document.getElementById('cartTotal');
  const countEl=document.getElementById('cartCount');
  if(!el)return;
  const totalQty=state.cart.reduce((a,c)=>a+c.qty,0);
  if(countEl)countEl.textContent=totalQty;
  if(!state.cart.length){
    el.innerHTML='<div class="cart-empty">🛒 Carrito vacío</div>';
    if(totEl)totEl.textContent='Total: $0';return;
  }
  el.innerHTML=state.cart.map(c=>{
    const subtotal=c.qty*c.price;
    const ganancia=(c.price-c.cost)*c.qty;
    return`<div class="cart-item">
      <div class="cart-item-info">
        <strong>${c.name}</strong> <span class="variant-tag">${c.variant}</span>
        ${c.discount?`<span class="discount-tag">−${c.discount}%</span>`:''}
        <div class="cart-item-sub">×${c.qty} @ ${cop(c.price)} · Ganancia: ${cop(ganancia)}</div>
      </div>
      <div class="cart-item-right">
        <span class="cart-item-total">${cop(subtotal)}</span>
        <button class="btn-icon btn-icon-del" onclick="removeFromCart('${c.cartKey}')">✕</button>
      </div>
    </div>`;
  }).join('');
  const tot=state.cart.reduce((a,c)=>a+c.qty*c.price,0);
  const gananciaTotal=state.cart.reduce((a,c)=>a+(c.price-c.cost)*c.qty,0);
  if(totEl)totEl.innerHTML=`
    <div class="cart-total-row"><span>Total</span><strong>${cop(tot)}</strong></div>
    <div class="cart-total-row muted"><span>Ganancia estimada</span><span style="color:var(--success)">${cop(gananciaTotal)}</span></div>`;
}

async function confirmSale(){
  if(!state.cart.length){toast('Agrega productos al carrito','error');return;}
  const total=state.cart.reduce((a,c)=>a+c.qty*c.price,0);
  const discountAvg=state.cart.reduce((a,c)=>a+(c.discount||0),0)/state.cart.length;
  const empId=state.currentUser.empId;
  const clientName=document.getElementById('pvClientName')?.value||'';
  const clientPhone=document.getElementById('pvClientPhone')?.value||'';
  const newSale={
    date:now(),emp:state.currentUser.name,empId,
    items:state.cart.map(c=>({name:c.name,variant:c.variant,variantId:c.variantId,qty:c.qty,price:c.price,pid:c.id})),
    total,type:'venta',note:document.getElementById('pvNote')?.value||'',
    discount:Math.round(discountAvg),clientName,clientPhone
  };
  const saved=await saveSaleDB(newSale);
  if(!saved){toast('Error al guardar la venta','error');return;}
  for(const c of state.cart){
    if(state.assignmentVariants[empId]&&state.assignmentVariants[empId][c.variantId])
      state.assignmentVariants[empId][c.variantId].stock-=c.qty;
    const prod=state.products.find(p=>p.id===c.id);
    if(prod){const variant=prod.variants.find(v=>v.id===c.variantId);if(variant)variant.stock-=c.qty;prod.stock=prod.variants.reduce((s,v)=>s+v.stock,0);}
  }
  state.sales.unshift({...newSale,id:saved.id});
  // Actualizar clientes localmente
  if(clientName){
    const existing=state.clients.find(c=>c.empId===empId&&c.name===clientName);
    if(existing){existing.lastSale=newSale.date;existing.totalPurchases+=total;if(clientPhone)existing.phone=clientPhone;}
    else state.clients.push({id:Date.now(),name:clientName,phone:clientPhone,empId,lastSale:newSale.date,totalPurchases:total});
    loadClientSuggestions();
  }
  state.lastReceipt={...newSale,id:saved.id};
  toast(`Venta registrada: ${cop(total)}`);
  showReceiptModal(state.lastReceipt);
  state.cart=[];initNewSale();
  renderStockAlerts();
}

// ===================== COMPROBANTE =====================
function showReceiptModal(sale){
  const el=document.getElementById('receiptContent');if(!el)return;
  const ganancia=sale.items.reduce((a,i)=>{const p=state.products.find(x=>x.id===i.pid);return a+(i.price-(p?p.cost:0))*i.qty;},0);
  el.innerHTML=`<div class="receipt">
    <div class="receipt-brand">⚡ StockMaster Pro</div>
    <div class="receipt-divider"></div>
    <div class="receipt-row"><span>Fecha:</span><strong>${sale.date}</strong></div>
    <div class="receipt-row"><span>Vendedor:</span><strong>${sale.emp}</strong></div>
    ${sale.clientName?`<div class="receipt-row"><span>Cliente:</span><strong>${sale.clientName}</strong></div>`:''}
    ${sale.clientPhone?`<div class="receipt-row"><span>Tel:</span><strong>${sale.clientPhone}</strong></div>`:''}
    <div class="receipt-divider"></div>
    ${sale.items.map(i=>`<div class="receipt-item">
      <div>${i.name}${i.variant?` (${i.variant})`:''}</div>
      <div>${i.qty} × ${cop(i.price)} = ${cop(i.qty*i.price)}</div>
    </div>`).join('')}
    <div class="receipt-divider"></div>
    ${sale.discount?`<div class="receipt-row"><span>Descuento:</span><span>−${sale.discount}%</span></div>`:''}
    <div class="receipt-total"><span>TOTAL</span><strong>${cop(sale.total)}</strong></div>
    ${sale.note?`<div class="receipt-note">Nota: ${sale.note}</div>`:''}
    <div class="receipt-divider"></div>
    <div class="receipt-footer">¡Gracias por tu compra!</div>
  </div>`;
  document.getElementById('receiptModal').classList.add('open');
}

function printReceipt(){
  const content=document.getElementById('receiptContent')?.innerHTML||'';
  const w=window.open('','_blank','width=400,height=600');
  w.document.write(`<!DOCTYPE html><html><head><title>Comprobante</title>
  <style>body{font-family:monospace;padding:20px;color:#000;background:#fff}
  .receipt-brand{font-size:20px;font-weight:bold;text-align:center;margin-bottom:10px}
  .receipt-divider{border-top:1px dashed #000;margin:8px 0}
  .receipt-row{display:flex;justify-content:space-between;margin:4px 0;font-size:13px}
  .receipt-item{display:flex;justify-content:space-between;margin:4px 0;font-size:12px}
  .receipt-total{display:flex;justify-content:space-between;font-size:16px;font-weight:bold;margin-top:8px}
  .receipt-footer{text-align:center;margin-top:12px;font-size:12px}</style>
  </head><body>${content}</body></html>`);
  w.document.close();w.print();
}

function shareReceiptWhatsApp(){
  const sale=state.lastReceipt;if(!sale)return;
  const items=sale.items.map(i=>`• ${i.name}${i.variant?` (${i.variant})`:''} ×${i.qty} → ${cop(i.qty*i.price)}`).join('\n');
  const msg=`*Comprobante de venta ⚡*\nFecha: ${sale.date}\nVendedor: ${sale.emp}${sale.clientName?'\nCliente: '+sale.clientName:''}\n\n${items}\n\n*Total: ${cop(sale.total)}*${sale.note?'\nNota: '+sale.note:''}\n\n_StockMaster Pro_`;
  const phone=document.getElementById('pvClientPhone')?.value||'';
  const url=`https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
  closeModal('receiptModal');
}

// ===================== REEMBOLSOS =====================
function initRefund(){
  const rp=document.getElementById('refProduct');if(!rp)return;
  rp.innerHTML='<option value="">— Selecciona —</option>'+
    getMyAssignedProducts().map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

async function confirmRefund(){
  const rp=document.getElementById('refProduct');if(!rp)return;
  const id=parseInt(rp.value);
  const qty=parseInt(document.getElementById('refQty').value)||1;
  const reason=document.getElementById('refReason').value.trim();
  const amount=parseFloat(document.getElementById('refAmount').value)||0;
  if(!id){toast('Selecciona un producto','error');return;}
  if(!reason){toast('Indica el motivo','error');return;}
  const p=state.products.find(x=>x.id===id);
  const empId=state.currentUser.empId;
  const newRefund={
    date:now(),emp:state.currentUser.name,empId,
    items:[{name:p?p.name:'Producto',variant:'',qty,price:amount,pid:id}],
    total:amount,type:'reembolso',note:reason,discount:0,clientName:'',clientPhone:''
  };
  const saved=await saveSaleDB(newRefund);
  state.sales.unshift({...newRefund,id:saved.id});
  toast('Reembolso registrado');
  rp.value='';
  ['refQty','refReason','refAmount'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='refQty'?1:'';});
}

// ===================== MIS VENTAS =====================
function renderMySales(){
  const empId=state.currentUser.empId;
  const mine=state.sales.filter(s=>s.empId===empId);
  // Banner meta
  const month=currentMonth();
  const goal=state.goals[`${empId}_${month}`]||0;
  const banner=document.getElementById('myGoalBanner');
  if(banner&&goal){
    const parts=month.split('-');
    const monthSales=mine.filter(s=>s.type==='venta'&&s.date.includes(parts[1]+'/'+parts[0]));
    const monthTotal=monthSales.reduce((a,s)=>a+s.total,0);
    const pct=Math.min(Math.round((monthTotal/goal)*100),100);
    banner.innerHTML=`<div class="goal-banner">
      <div class="goal-banner-label">🎯 Meta ${month}: ${pct}% — ${cop(monthTotal)} / ${cop(goal)}</div>
      <div class="goal-bar-track" style="margin-top:6px"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }else if(banner)banner.innerHTML='';

  document.getElementById('mySalesBody').innerHTML=
    mine.map(s=>{
      const ganancia=s.items.reduce((a,i)=>{const p=state.products.find(x=>x.id===i.pid);return a+(i.price-(p?p.cost:0))*i.qty;},0);
      return`<tr>
        <td class="muted-td">#${s.id}</td>
        <td class="date-td">${s.date}</td>
        <td class="muted-td">${s.clientName||'—'}</td>
        <td class="items-td">${s.items.map(i=>`${i.name}${i.variant?` (${i.variant})`:''} ×${i.qty}`).join(', ')}</td>
        <td class="muted-td">${s.discount?s.discount+'%':'—'}</td>
        <td style="font-weight:700;color:${s.type==='venta'?'var(--success)':'var(--danger)'}">
          ${s.type==='reembolso'?'−':''}${cop(s.total)}</td>
        <td style="color:var(--success)">${s.type==='venta'?cop(ganancia):'—'}</td>
        <td><span class="badge ${s.type==='venta'?'badge-venta':'badge-refund'}">${s.type}</span></td>
        <td class="muted-td">${s.note||'—'}</td>
        <td>${s.type==='venta'?`<button class="btn-icon btn-icon-edit" onclick="viewReceipt(${s.id})" title="Ver comprobante">🧾</button>`:''}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="10" class="empty-td">Sin registros</td></tr>';
}

function viewReceipt(saleId){
  const sale=state.sales.find(s=>s.id===saleId);
  if(!sale)return;
  state.lastReceipt=sale;
  showReceiptModal(sale);
}

// ===================== MIS CLIENTES =====================
function renderMyClients(){
  const empId=state.currentUser.empId;
  const myClients=state.clients.filter(c=>c.empId===empId);
  const el=document.getElementById('myClientsBody');if(!el)return;
  el.innerHTML=myClients.map(c=>`
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone||'—'}</td>
      <td class="muted-td">${c.lastSale||'—'}</td>
      <td style="color:var(--success);font-weight:600">${cop(c.totalPurchases)}</td>
      <td>
        ${c.phone?`<button class="btn btn-ghost btn-sm" onclick="window.open('https://wa.me/${c.phone.replace(/\D/g,'')}','_blank')">
          💬 WhatsApp
        </button>`:'—'}
      </td>
    </tr>`).join('')||'<tr><td colspan="5" class="empty-td">Sin clientes registrados</td></tr>';
}

// ===================== EXPORT =====================
function exportSalesExcel(){
  const rows=[['#','Fecha','Empleado','Cliente','Productos','Descuento','Total','Ganancia','Tipo','Nota']];
  state.sales.forEach(s=>{
    const ganancia=s.items.reduce((a,i)=>{const p=state.products.find(x=>x.id===i.pid);return a+(i.price-(p?p.cost:0))*i.qty;},0);
    rows.push([s.id,s.date,s.emp,s.clientName||'',s.items.map(i=>i.name+' ×'+i.qty).join('; '),
      (s.discount||0)+'%',s.total,s.type==='venta'?ganancia:0,s.type,s.note||'']);
  });
  downloadCSV(rows,'ventas_stockmaster.csv');
}

function exportCierreExcel(){
  const dateEl=document.getElementById('cierreDate');
  const selectedDate=dateEl?dateEl.value:'hoy';
  const rows=[['Empleado','Ventas','Ganancia','Reembolsos','Núm. Transacciones']];
  const daySales=state.sales.filter(s=>{
    if(!selectedDate)return false;
    const parts=selectedDate.split('-');
    const label=`${parts[2]}/${parts[1]}/${parts[0]}`;
    return s.date.startsWith(label)||s.date.includes(label);
  });
  state.employees.filter(e=>e.role!=='admin').forEach(e=>{
    const empSales=daySales.filter(s=>s.empId===e.id&&s.type==='venta');
    if(!empSales.length)return;
    const total=empSales.reduce((a,s)=>a+s.total,0);
    const gain=empSales.reduce((a,s)=>a+s.items.reduce((b,i)=>{const p=state.products.find(x=>x.id===i.pid);return b+(i.price-(p?p.cost:0))*i.qty;},0),0);
    const refunds=daySales.filter(s=>s.empId===e.id&&s.type==='reembolso').reduce((a,s)=>a+s.total,0);
    rows.push([e.name,total,gain,refunds,empSales.length]);
  });
  downloadCSV(rows,`cierre_${selectedDate}.csv`);
}

function exportSalesPDF(){
  const rows=state.sales.slice(0,50);
  let html=`<html><head><title>Ventas StockMaster</title>
  <style>body{font-family:sans-serif;padding:20px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #ddd;padding:6px 10px;font-size:12px}th{background:#f0f0f0}
  .v{color:green}.r{color:red}</style></head><body>
  <h1>⚡ StockMaster Pro — Historial de Ventas</h1>
  <p>Generado: ${now()}</p>
  <table><thead><tr><th>#</th><th>Fecha</th><th>Empleado</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Tipo</th></tr></thead><tbody>
  ${rows.map(s=>`<tr>
    <td>#${s.id}</td><td>${s.date}</td><td>${s.emp}</td><td>${s.clientName||'—'}</td>
    <td>${s.items.map(i=>i.name+' ×'+i.qty).join(', ')}</td>
    <td class="${s.type==='venta'?'v':'r'}">${s.type==='reembolso'?'−':''}${cop(s.total)}</td>
    <td>${s.type}</td>
  </tr>`).join('')}
  </tbody></table></body></html>`;
  const w=window.open('','_blank');
  w.document.write(html);w.document.close();w.print();
}

function exportMySalesPDF(){
  const empId=state.currentUser.empId;
  const mine=state.sales.filter(s=>s.empId===empId);
  let html=`<html><head><title>Mis Ventas</title>
  <style>body{font-family:sans-serif;padding:20px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #ddd;padding:6px 10px;font-size:12px}th{background:#f0f0f0}
  .v{color:green}.r{color:red}</style></head><body>
  <h1>⚡ Mis Ventas — ${state.currentUser.name}</h1>
  <p>Generado: ${now()}</p>
  <table><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Total</th><th>Tipo</th><th>Nota</th></tr></thead><tbody>
  ${mine.map(s=>`<tr>
    <td>#${s.id}</td><td>${s.date}</td><td>${s.clientName||'—'}</td>
    <td>${s.items.map(i=>i.name+' ×'+i.qty).join(', ')}</td>
    <td class="${s.type==='venta'?'v':'r'}">${s.type==='reembolso'?'−':''}${cop(s.total)}</td>
    <td>${s.type}</td><td>${s.note||'—'}</td>
  </tr>`).join('')}
  </tbody></table></body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();w.print();
}

function downloadCSV(rows,filename){
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  toast('Archivo descargado');
}

// ===================== INIT =====================
document.querySelectorAll('.modal-bg').forEach(bg=>
  bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open');}));

async function initApp(){
  if(getToken()){clearToken();}
}
initApp();
