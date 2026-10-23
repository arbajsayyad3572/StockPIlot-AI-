let dashboardData = null;
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('en-IN').format(n);
const money = n => '₹' + new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n);
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2500)}
async function loadDashboard(){
  $('refreshBtn').textContent='↻  Updating…';
  try{
    const res=await fetch('/api/dashboard'); if(!res.ok) throw new Error('Could not load dashboard');
    dashboardData=await res.json();
    $('skuCount').textContent=fmt(dashboardData.metrics.sku_count);
    $('inventoryValue').textContent=money(dashboardData.metrics.inventory_value);
    $('lowStockCount').textContent=fmt(dashboardData.metrics.low_stock_count);
    $('forecastTotal').textContent=fmt(dashboardData.metrics.forecast_7d)+' units';
    const sel=$('productSelect'), old=sel.value;
    sel.innerHTML=dashboardData.products.map(p=>`<option value="${p.sku}">${p.product_name}</option>`).join('');
    if(old && dashboardData.products.some(p=>p.sku===old)) sel.value=old;
    renderAlerts(dashboardData.alerts); renderInventory();
    await loadForecast(sel.value);
  }catch(e){toast('Unable to load data. Check that the server is running.');console.error(e)}
  finally{$('refreshBtn').textContent='↻  Refresh insights'}
}
function renderAlerts(alerts){
  $('alertBadge').textContent=alerts.length;
  $('alertList').innerHTML=alerts.length?alerts.slice(0,4).map(a=>`<div class="alert-item"><div class="alert-symbol">⚠</div><div class="alert-copy"><b>${a.product_name}</b><small>${a.stock} units left · Reorder at ${a.reorder_point}</small></div><span class="alert-level ${a.severity.toLowerCase()}">${a.severity}</span></div>`).join(''):'<div class="empty-alert">✓ All products are above their reorder points.</div>';
}
function renderInventory(){
  if(!dashboardData)return;
  const q=$('searchInput').value.toLowerCase(), filter=$('stockFilter').value;
  const rows=dashboardData.products.filter(p=>{
    const low=p.current_stock<=p.reorder_point;
    return (p.product_name.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q))&&(filter==='all'||(filter==='low'?low:!low));
  });
  $('inventoryBody').innerHTML=rows.length?rows.map(p=>{
    const level=p.current_stock<=Math.max(1,Math.floor(p.reorder_point/2))?'critical':p.current_stock<=p.reorder_point?'low':'healthy';
    const status=level==='critical'?'Critical':level==='low'?'Low stock':'Healthy';
    const pct=Math.min(100,Math.round(p.current_stock/Math.max(1,p.reorder_point*2)*100));
    return `<tr><td><div class="product-cell"><div class="product-icon">${p.product_name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div><div class="product-name">${p.product_name}</div><div class="product-sku">${p.sku}</div></div></div></td><td><div class="stock-num">${fmt(p.current_stock)} units</div><div class="stock-track"><div class="stock-fill ${level}" style="width:${pct}%"></div></div></td><td><span class="forecast-num">${fmt(p.forecast_7d)} units</span></td><td><span class="cover">${p.days_of_stock>=900?'—':p.days_of_stock+' days'}</span></td><td><span class="reorder">${fmt(p.suggested_order)} units</span></td><td><span class="status ${level}">${status}</span></td><td><button class="row-action" title="Update stock" data-sku="${p.sku}">⋯</button></td></tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">No matching products found.</td></tr>';
  $('tableCount').textContent=`Showing ${rows.length} of ${dashboardData.products.length} products`;
  document.querySelectorAll('.row-action').forEach(btn=>btn.addEventListener('click',()=>editStock(btn.dataset.sku)));
}
async function loadForecast(sku){
  if(!sku)return;
  $('chart').innerHTML='<div class="chart-placeholder">Calculating demand…</div>';
  try{
    const r=await fetch('/api/forecast/'+encodeURIComponent(sku)+'?days=7');const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Forecast failed');
    const values=data.forecast.map(x=>x.demand), max=Math.max(1,...values);
    $('forecastProductTotal').innerHTML=`${fmt(values.reduce((a,b)=>a+b,0))} <span>units</span>`;
    $('chart').innerHTML=data.forecast.map(x=>{
      const d=new Date(x.date+'T12:00:00');
      const day=d.toLocaleDateString('en-IN',{weekday:'short'});
      const height=Math.max(5,Math.round(x.demand/max*100));
      return `<div class="bar-col"><div class="bar-val">${x.demand}</div><div class="bar" style="height:${height}%"></div><div class="bar-day">${day}</div></div>`;
    }).join('');
  }catch(e){$('chart').innerHTML='<div class="chart-placeholder">Forecast unavailable</div>';console.error(e)}
}
function editStock(sku){
  const p=dashboardData.products.find(x=>x.sku===sku);if(!p)return;
  const value=prompt(`Update on-hand stock for ${p.product_name} (units):`,p.current_stock);
  if(value===null)return;
  const stock=Number(value);
  if(!Number.isInteger(stock)||stock<0){toast('Enter a valid non-negative whole number.');return}
  fetch('/api/stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku,current_stock:stock})})
    .then(r=>r.json().then(d=>({ok:r.ok,data:d}))).then(x=>{if(!x.ok)throw new Error(x.data.error);toast('Stock updated successfully');loadDashboard()}).catch(e=>toast(e.message));
}
function exportCSV(){
  if(!dashboardData)return;
  const header=['sku','product_name','unit_price','current_stock','lead_time_days','reorder_point','forecast_7d','avg_daily_demand','days_of_stock','suggested_order'];
  const lines=[header.join(','),...dashboardData.products.map(p=>header.map(k=>JSON.stringify(p[k]??'')).join(','))];
  const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventory_insights.csv';a.click();URL.revokeObjectURL(url);toast('Inventory CSV exported');
}
$('productSelect').addEventListener('change',e=>loadForecast(e.target.value));
$('searchInput').addEventListener('input',renderInventory);
$('stockFilter').addEventListener('change',renderInventory);
$('refreshBtn').addEventListener('click',loadDashboard);
$('exportBtn').addEventListener('click',exportCSV);
$('viewInventory').addEventListener('click',()=>document.getElementById('inventory').scrollIntoView({behavior:'smooth'}));
loadDashboard();
