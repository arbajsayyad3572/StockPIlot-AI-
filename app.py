from flask import Flask, render_template, jsonify, request
import os, sqlite3
from datetime import date, timedelta
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "instance", "warehouse.db")
DATA_DIR = os.path.join(ROOT, "data")
app = Flask(__name__)

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = connect()
    con.executescript("""
    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY, product_name TEXT NOT NULL, unit_price REAL NOT NULL,
      current_stock INTEGER NOT NULL, lead_time_days INTEGER NOT NULL, reorder_point INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS demand_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, sku TEXT NOT NULL,
      product_name TEXT NOT NULL, units_sold INTEGER NOT NULL, unit_price REAL NOT NULL,
      promotion INTEGER NOT NULL
    );
    """)
    count = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count == 0:
        p = pd.read_csv(os.path.join(DATA_DIR, "products.csv"))
        p.to_sql("products", con, if_exists="append", index=False)
        h = pd.read_csv(os.path.join(DATA_DIR, "demand_history.csv"))
        h.to_sql("demand_history", con, if_exists="append", index=False)
    con.commit()
    con.close()

def get_products():
    con=connect()
    rows=con.execute("SELECT * FROM products ORDER BY product_name").fetchall()
    con.close()
    return [dict(r) for r in rows]

def forecast_for(sku, days=7):
    con=connect()
    hist=pd.read_sql_query("SELECT date, units_sold, promotion FROM demand_history WHERE sku=? ORDER BY date", con, params=(sku,))
    con.close()
    if hist.empty:
        return []
    hist["date"]=pd.to_datetime(hist["date"])
    hist["dow"]=hist["date"].dt.dayofweek
    hist["month"]=hist["date"].dt.month
    hist["day_of_year"]=hist["date"].dt.dayofyear
    hist["lag1"]=hist["units_sold"].shift(1)
    hist["lag7"]=hist["units_sold"].shift(7)
    hist["rolling7"]=hist["units_sold"].shift(1).rolling(7).mean()
    hist=hist.dropna()
    features=["dow","month","day_of_year","lag1","lag7","rolling7","promotion"]
    model=RandomForestRegressor(n_estimators=100, random_state=42, min_samples_leaf=2)
    model.fit(hist[features], hist["units_sold"])
    recent=hist.tail(7)
    lag1=float(recent["units_sold"].iloc[-1])
    lag7=float(recent["units_sold"].iloc[-1])
    recent_values=list(pd.read_sql_query("SELECT units_sold FROM demand_history WHERE sku=? ORDER BY date DESC LIMIT 7", connect(), params=(sku,))["units_sold"].astype(float))
    rolling=sum(recent_values)/max(1,len(recent_values))
    last_date=date.today()
    output=[]
    for step in range(1,days+1):
        d=last_date+timedelta(days=step)
        x=pd.DataFrame([{
          "dow":d.weekday(),"month":d.month,"day_of_year":d.timetuple().tm_yday,
          "lag1":lag1,"lag7":lag7,"rolling7":rolling,"promotion":0
        }])[features]
        pred=max(0, round(float(model.predict(x)[0])))
        output.append({"date":d.isoformat(),"demand":pred})
        lag7=lag1
        lag1=pred
        rolling=(rolling*6+pred)/7
    return output

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/dashboard")
def dashboard():
    products=get_products()
    con=connect()
    total_sales=con.execute("SELECT COALESCE(SUM(units_sold),0) FROM demand_history WHERE date >= ?", ((date.today()-timedelta(days=30)).isoformat(),)).fetchone()[0]
    con.close()
    inventory_value=sum(p["current_stock"]*p["unit_price"] for p in products)
    alerts=[]
    for p in products:
        if p["current_stock"] <= p["reorder_point"]:
            alerts.append({"sku":p["sku"],"product_name":p["product_name"],"stock":p["current_stock"],"reorder_point":p["reorder_point"],"severity":"Critical" if p["current_stock"] <= max(1,p["reorder_point"]//2) else "Low"})
    ranked=[]
    for p in products:
        fc=forecast_for(p["sku"],7)
        total=sum(x["demand"] for x in fc)
        daily=round(total/7,1)
        days_left=round(p["current_stock"]/daily,1) if daily>0 else 999
        ranked.append({**p,"forecast_7d":total,"avg_daily_demand":daily,"days_of_stock":days_left,
                       "suggested_order":max(0,round(daily*(p["lead_time_days"]+7))-p["current_stock"])})
    ranked.sort(key=lambda x:(x["days_of_stock"],x["product_name"]))
    return jsonify({"products":ranked,"alerts":alerts,"metrics":{
        "sku_count":len(products),"low_stock_count":len(alerts),"sales_30d":int(total_sales),
        "inventory_value":round(inventory_value,2),"forecast_7d":sum(p["forecast_7d"] for p in ranked)
    }})

@app.route("/api/forecast/<sku>")
def forecast(sku):
    days=max(1,min(30,int(request.args.get("days",7))))
    p=next((x for x in get_products() if x["sku"]==sku),None)
    if not p: return jsonify({"error":"SKU not found"}),404
    return jsonify({"product":p,"forecast":forecast_for(sku,days)})

@app.route("/api/stock", methods=["POST"])
def update_stock():
    payload=request.get_json(silent=True) or {}
    sku=payload.get("sku")
    try: stock=int(payload.get("current_stock"))
    except (TypeError,ValueError): return jsonify({"error":"Stock must be a whole number"}),400
    if stock<0: return jsonify({"error":"Stock cannot be negative"}),400
    con=connect()
    cur=con.execute("UPDATE products SET current_stock=? WHERE sku=?",(stock,sku))
    con.commit(); con.close()
    if cur.rowcount==0: return jsonify({"error":"SKU not found"}),404
    return jsonify({"ok":True,"message":"Stock updated"})

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
