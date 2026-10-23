# StockPilot-AI

🚀 **Live Demo:** https://stockpilot-ai-05e9.onrender.com

AI-Powered Stock Market Prediction & Risk Analysis

# StockPilot AI — Warehouse Inventory Prediction

A premium-looking, responsive warehouse inventory dashboard for a hackathon demo. It uses a free local stack: Flask (backend), SQLite (database), pandas, and a scikit-learn Random Forest regression model.

## Features
- 8 sample products and 180 days of generated sample demand data
- SQLite database auto-created and seeded from CSV on first launch
- 7-day demand forecasts per SKU using a Random Forest model
- Inventory value, low-stock alerts, stock cover, and suggested reorder quantity
- Search/filter inventory, update on-hand stock, export current inventory insights to CSV
- Responsive dashboard UI for desktop and mobile

## Important dataset note
The included dataset is synthetic demo data generated for this project. It is not Amazon internal data, not a real warehouse feed, and forecast values are for demonstration only. For real-world deployment, replace the CSV files with verified warehouse sales and inventory data.

## Requirements
- Python 3.10 or newer
- Internet is not required for backend/data/model. Google Fonts are loaded from the internet; the dashboard still works with fallback fonts if offline.

## Run on Windows
1. Extract the ZIP.
2. Open the extracted `warehouse_ai_inventory` folder in VS Code.
3. Open Terminal in that folder.
4. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
5. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
6. Start the app:
   ```bash
   python app.py
   ```
7. Open `http://127.0.0.1:5000` in your browser.

## Run on macOS/Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Then open `http://127.0.0.1:5000`.

## Project structure
```text
warehouse_ai_inventory/
├── app.py
├── requirements.txt
├── README.md
├── data/
│   ├── products.csv
│   └── demand_history.csv
├── instance/
│   └── warehouse.db   # created on first run
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── app.js
```

## Database/API
- `GET /api/dashboard` — metrics, product stock, alerts, forecasts
- `GET /api/forecast/<sku>?days=7` — forecast 1–30 days for a SKU
- `POST /api/stock` — update stock using JSON: `{"sku":"SKU1001","current_stock":120}`

## Model overview
Features: day of week, month, day of year, previous-day demand, 7-day lag, rolling 7-day average, and a promotion indicator. The dashboard forecasts with a Random Forest regressor and recursively feeds predictions into future-day inputs. The demo assumes no planned promotion on forecast days.

## Hackathon presentation suggestion
Pitch it as a decision-support tool: it flags possible stockouts early and gives a suggested replenishment quantity based on predicted demand and supplier lead time. Explain that real production use would need live warehouse data, time-aware validation, model monitoring, and business constraints.
