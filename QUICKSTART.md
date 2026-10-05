# KE Simulator - Quick Start Guide

## Get Started in 3 Minutes

### 1. Install dependencies
```bash
cd examples/market_energy_demo/frontend
npm install
```

### 2. Start the development server
```bash
npm run dev
```
The browser will open automatically at `http://localhost:5173`

### 3. Use the application

#### Load prices:
- Click **"Load example prices"** to load 96 prices automatically
- Or use **"Load CSV"** to load a custom file

#### Publish prices:
- Optionally, edit some prices by clicking the  icon
- Click **" Publish new prices"**
- Watch how the animation shows the data flow step by step

#### View results:
- Prices will appear in the **"Energy Manager"** panel on the right
- You'll see the statistics (min, avg, max)
- Both panels show an event log

## Basic Structure

```
KE Simulator
├── Market Side UI (blue panel)
│   ├── Price loading
│   ├── Editable table
│   └── Publish button
├── Flow Diagram (central animation)
│   └── Shows the data journey
└── Energy Manager UI (green panel)
    ├── Last received signals
    ├── Price table
    └── Statistics
```

## Main Use Cases

### Case 1: Full Flow
1. Open the app
2. Click "Load example prices"
3. Click "Publish new prices"
4. Watch the animation and data in Energy Manager

### Case 2: Load CSV
1. Download `example_prices.csv` from the directory
2. Click "Load CSV"
3. Select the file
4. Publish (optional: edit first)

### Case 3: Edit Prices
1. Load example prices
2. Click  next to any price
3. Modify the value
4. Confirm with 
5. Publish

## What to Watch

### Flow Animation
- **Gray**: Stage not visited
- **Pulsing yellow**: Current stage
- **Green**: Completed stage

### Event Timelines
- Market Side (left): Events from the start of publication
- Energy Manager (right): Reception events
- Both sync in real time

### Statistics
Once prices are received in Energy Manager:
- **Points**: Number of intervals (96)
- **Min**: Lowest price of the day
- **Avg**: Average price
- **Max**: Highest price of the day

## Build for Production

```bash
npm run build
```

Compiled files in `dist/` ready to deploy.

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5173 in use | `npm run dev -- --port 5174` |
| Styles not loading | Run `npm install` again |
| TypeScript error | `npm run type-check` |
| Clear cache | `rm -rf node_modules .vite dist && npm install` |

## Full Documentation

- **README.md**: Complete guide
- **ARCHITECTURE.md**: Technical details and extensions
- **example_prices.csv**: Test data

---

**Ready!** Now you can see how data travels through the Knowledge Engine 
