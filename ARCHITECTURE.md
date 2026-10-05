# KE Simulator Architecture

## Overview

KE Simulator is a visual demonstration of how energy price data flows through the Knowledge Engine architecture with Smart Connectors. The goal is educational and modular.

## Application Layers

### 1. Presentation Layer (UI)

**Main components:**

- **App.tsx**: Root component that orchestrates everything. Holds the global state and coordinates between Market Side and Energy Manager.
- **MarketSideUI**: Price loading and editing panel. Market Side interface.
- **EnergyManagerUI**: Reception and visualization panel. Energy Manager interface.
- **FlowDiagram**: Animated visualization of the data journey.
- **EventTimeline**: Real-time event log panel.
- **PriceTable**: Reusable price table with editable mode.

**Shared state:**
```typescript
- marketEvents: FlowEvent[]        // Events on Market Side
- energyEvents: FlowEvent[]        // Events on Energy Manager
- isPublishing: boolean            // Publication state
- currentStage: FlowStage | null   // Current flow stage
- receivedSignal: PriceSignal      // Last signal on Energy Manager
```

### 2. Services Layer

**SimulationService.ts**
- Orchestrates the complete publication flow
- Emits events sequentially (with delays to simulate latency)
- Notifies listeners when prices are delivered
- Callback interface:
  ```typescript
  onFlowEvent(callback: (event: FlowEvent) => void)
  onPriceUpdate(callback: (signal: PriceSignal) => void)
  publishPrices(pricePoints: PricePoint[]): Promise<void>
  ```

**MarketService.ts**
- Stores loaded prices
- Allows editing individual prices
- Methods: `setPrices()`, `getPrices()`, `updatePrice()`, `clearPrices()`

**EnergyManagerService.ts**
- Stores received signals (history up to 10)
- Methods: `receiveSignal()`, `getLastSignal()`, `getReceivedSignals()`

### 3. Types Layer (TypeScript)

**types/index.ts** defines:
- `PricePoint`: 15-minute interval with a price
- `PriceSignal`: Collection of prices with metadata
- `FlowEvent`: Event in the data flow
- `FlowStage`: Enum of 6 stages
- `ConnectorStatus`: Smart Connector status

### 4. Utilities Layer

**utils/priceUtils.ts**
- `generateExamplePrices()`: Generates 96 prices with a realistic curve
- `parseCSV()`: Parses a CSV file into PricePoint[]
- `createPriceSignal()`: Creates a PriceSignal object
- `calculatePriceStats()`: Calculates min, max, average, count

## Data Flow

```
User clicks "Publish"
           ↓
    App.handlePublish()
           ↓
    SimulationService.publishPrices(prices)
           ↓
    Emits 6 events sequentially:
    1. prices-loaded
    2. market-connector-processing
    3. knowledge-engine-received
    4. knowledge-engine-routing
    5. energy-connector-received
    6. energy-manager-updated
           ↓
    On the final event, notifies listeners:
    - onPriceUpdate() → updates Energy Manager UI
    - onFlowEvent() → updates event timelines
```

## Publication Lifecycle

1. **Price loading** (Manual)
   - User loads CSV or example
   - `MarketService.setPrices()` stores on Market Side
   - UI shows a table with 96 prices

2. **Publication started**
   - User clicks the "Publish new prices" button
   - `App.handlePublish()` clears previous events
   - `isPublishing = true` (button turns yellow/pulsing)

3. **Event flow** (Animated)
   - `SimulationService` emits events with delays (500-600ms each)
   - `FlowDiagram` updates with each event (green/yellow colors)
   - `EventTimeline` logs in real time
   - Total: ~3-4 seconds for the full flow

4. **Reception on Energy Manager**
   - On the last event, `SimulationService` notifies `onPriceUpdate`
   - `EnergyManagerService.receiveSignal()` stores
   - Energy Manager UI updates automatically
   - Shows table, statistics, timestamp

## Extension Points

### To Integrate the Real Python Client

**Option 1: Backend Proxy (Recommended)**

```
Frontend (React)
    ↓
Proxy Backend (Flask/FastAPI)
    ↓
ke_client (Python)
    ↓
Knowledge Engine
```

Steps:
1. Create a backend in `backend/` with endpoints:
   - `POST /api/publish-prices`
   - `WebSocket /api/subscribe-prices` or polling

2. Replace `SimulationService` with HTTP/WebSocket calls

3. Backend uses `ke_client` to communicate with the real KE

**Option 2: Replace the Simulation Directly**

```typescript
// In SimulationService.ts
async publishPrices(pricePoints: PricePoint[]): Promise<void> {
  const signal = this.createSignal(pricePoints);
  
  // Replace the entire simulation with:
  const response = await fetch('/api/publish-prices', {
    method: 'POST',
    body: JSON.stringify(signal)
  });
  
  // Listen to real events from the backend
  // ...
}
```

### Add a New Message Type

For "Publish capacity limit":

1. Extend types:
```typescript
type MessageType = 'price-signal' | 'capacity-limit';

interface Message {
  type: MessageType;
  payload: PriceSignal | CapacityLimit;
}
```

2. Create a new service or method in `SimulationService`

3. Add UI in `MarketSideUI` for "Publish limit"

4. The flow would be identical to prices

### Add a New Connector

To support another actor (e.g. Energy Generator):

1. Create a new service: `GeneratorService.ts`
2. Create UI: `GeneratorUI.tsx`
3. Subscribe to events in `App.tsx`:
   ```typescript
   simulationService.onFlowEvent((event) => {
     if (event.stage === 'some-stage') {
       generatorService.handleEvent(event);
     }
   });
   ```

## State Management

### Global State (App.tsx)
- Holds the source of truth for events and prices
- Passes props to child components
- Changes propagate automatically

### Local State (Components)
- `MarketSideUI`: `prices` (editable table)
- `EnergyManagerUI`: Read from `EnergyManagerService`
- `FlowDiagram`: `completedStages` (animation)
- `EventTimeline`: Read from props

### Services (Singleton)
- `MarketService`: Stores Market Side prices
- `EnergyManagerService`: Stores received signals
- `SimulationService`: Orchestrates everything (single instance)

## Animations and UX

### FlowDiagram
- **Circle states**:
  - Gray: Not visited
  - Yellow + pulse: Processing
  - Green + ring: Completed
- **Connection arrow**:
  - Gray → Green when the previous stage completes
- **Timeout**: 500ms between stages

### EventTimeline
- Auto-scroll: last 20 lines
- Icon indicates status:  (success),  (error), ⏱ (pending)
- Timestamp in local HH:MM:SS format

### PriceTable
- Row hover: light background
- Inline editing with checkmark/X
- Number input with validation

## Example Data

### Simulated Daily Curve (96 prices)

```
Hour      | Price (EUR/MWh) | Description
----------|-----------------|------------------------
00:00-06:00 | 37-47           | Low prices (nights)
06:00-09:00 | 48-63           | Morning rise
09:00-12:00 | 63              | High plateau
12:00-15:00 | 63 (peak)       | Demand peak
15:00-18:00 | 53-63           | Gradual decline
18:00-21:00 | 47-52           | Night decline
21:00-00:00 | 40-46           | Low nights
```

Variability: ±5 EUR/MWh (random noise)

## Testing

### Main Use Cases

1. **Successful publication flow**
   - Load prices → Edit one → Publish → Verify on Energy Manager

2. **CSV loading**
   - Download `example_prices.csv`
   - Load file → Verify table

3. **Price editing**
   - Click  → Change value → Confirm/cancel

4. **Animation visualization**
   - Open console (F12) → Publish → Watch the event flow

### Debug

In `App.tsx`, you can add logging:
```typescript
useEffect(() => {
  simulationService.onFlowEvent((event) => {
    console.log('FlowEvent:', event);
  });
}, []);
```

## Performance

- **Renders**: React.memo not needed (simple components)
- **Re-renders**: Only when props or local state change
- **Size**: ~50KB gzipped (code + dependencies)
- **Bundle**: Vite generates ~200KB total with node_modules

## Code Conventions

### Naming
- Services: `*Service.ts` (singleton)
- Components: `*UI.tsx` or `*Component.tsx`
- Types: In `types/index.ts`
- Styles: Tailwind inline + `App.css` for globals

### Imports
```typescript
// Prefer:
import { Component } from './components/Component'

// Avoid:
import Component from './components/Component.tsx'
```

### Components
```typescript
interface Props {
  // Name with Props suffix
}

export const ComponentName: React.FC<Props> = ({ prop1, prop2 }) => {
  // Use React.FC<Props>
  return <div></div>
}
```

## Recommended Next Steps

1.  Working prototype completed
2.  Add unit tests (Jest + React Testing Library)
3.  Integration with the real ke_client (backend)
4.  Add a second message type (capacity)
5.  Improve charts (Chart.js or D3.js)
6.  Persistence in localStorage
7.  Dark/light mode

---

**Last updated**: 2026
