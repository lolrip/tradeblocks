# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TradeBlocks is a Next.js 15 application for analyzing options trading performance. It processes CSV exports of trade logs and daily portfolio logs to calculate comprehensive portfolio statistics, drawdowns, and performance metrics. The application uses IndexedDB for client-side storage of trading data.

## Development Commands

### Running the Application
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production bundle with Turbopack
- `npm start` - Start production server

### Testing
- `npm test` - Run all tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run test:portfolio` - Run portfolio stats tests specifically

To run a single test file:
```bash
npm test -- path/to/test-file.test.ts
```

To run a specific test case:
```bash
npm test -- path/to/test-file.test.ts -t "test name pattern"
```

### Code Quality
- `npm run lint` - Run ESLint on the codebase

## Architecture

### Core Data Flow

1. **Data Import**: Users upload CSV files (trade logs and optional daily logs)
2. **Processing Pipeline**:
   - CSV parsing (`lib/processing/csv-parser.ts`)
   - Trade/daily log processing (`lib/processing/trade-processor.ts`, `lib/processing/daily-log-processor.ts`)
   - Data validation (`lib/models/validators.ts`)
3. **Storage**: Data stored in IndexedDB via store modules (`lib/db/`)
4. **Calculation**: Portfolio statistics calculated via `lib/calculations/portfolio-stats.ts`
5. **State Management**: Zustand stores (`lib/stores/`) manage UI state and coordinate data access

### Key Architectural Patterns

**Block-Based Organization**: Trading data is organized into "blocks" - each block represents a trading portfolio/strategy with:
- Trade log (required): Individual trade records
- Daily log (optional): Daily portfolio values for enhanced performance calculations
- Calculated statistics cached for performance

**Dual Storage Pattern**:
- Raw trade/daily log data → IndexedDB (via `lib/db/`)
- UI state & metadata → Zustand stores (via `lib/stores/`)
- This separation allows efficient data handling for large datasets

**Math.js for Statistical Calculations**: All statistics use `math.js` library to ensure consistency:
- Sharpe Ratio: Uses sample standard deviation (N-1) via `std(data, 'uncorrected')`
- Sortino Ratio: Uses population standard deviation (N) via `std(data, 'biased')` to match numpy
- This ensures exact parity with Python calculations

### Directory Structure

- `app/` - Next.js 15 app router pages and layouts
  - `(platform)/` - Main application routes with sidebar layout
- `components/` - React components
  - `ui/` - shadcn/ui components (Radix UI primitives)
  - `performance-charts/` - Recharts-based performance visualizations
- `lib/` - Core business logic (framework-agnostic)
  - `models/` - TypeScript interfaces and types
  - `processing/` - CSV parsing and data processing
  - `calculations/` - Portfolio statistics calculations
  - `db/` - IndexedDB operations
  - `stores/` - Zustand state management
- `tests/` - Jest test suites
  - `unit/` - Unit tests for calculations and processing
  - `integration/` - Integration tests for data flow
  - `data/` - Mock data and test fixtures

### Critical Implementation Details

**Date Handling**: Trades use separate `dateOpened` (Date object) and `timeOpened` (string) fields. When processing CSVs, parse dates carefully and maintain consistency with legacy format.

**Trade P&L Calculations**:
- Always separate gross P&L (`trade.pl`) from commissions (`openingCommissionsFees` + `closingCommissionsFees`)
- Net P&L = gross P&L - total commissions
- Strategy filtering MUST use trade-based calculations only (not daily logs) since daily logs represent full portfolio performance

**Drawdown Calculations**:
- Uses daily logs when available for more accurate drawdowns
- Falls back to trade-based equity curve when daily logs are missing
- Portfolio value tracks cumulative returns over time
- See `lib/calculations/portfolio-stats.ts` for implementation

**IndexedDB Data References**: The `ProcessedBlock` interface uses `dataReferences` to store keys for related data in IndexedDB. When working with blocks, always load associated trades/daily logs separately.

## Testing Strategy

Tests use `fake-indexeddb` for IndexedDB simulation. When writing tests:
- Import `tests/setup.ts` is configured automatically via Jest setup
- Use mock data from `tests/data/` when possible
- Portfolio stats tests validate consistency
- Always test edge cases: empty datasets, single trade, missing daily logs

## Path Aliases

TypeScript is configured with `@/*` pointing to repository root, allowing imports like:
```typescript
import { Trade } from '@/lib/models/trade'
import { Button } from '@/components/ui/button'
```

## UI Component Library

Uses shadcn/ui components built on Radix UI primitives with Tailwind CSS. Components are in `components/ui/` and follow the shadcn pattern (copy-paste, not npm installed).

## State Management

Zustand stores manage:
- **block-store**: Active block selection, block metadata, statistics
- **performance-store**: Filtered performance data, chart data caching

IndexedDB stores (via `lib/db/`) handle persistence of:
- Blocks metadata
- Trade records (can be thousands per block)
- Daily log entries
- Cached calculations

## Portfolio Optimizer (Central Hub)

### Overview
The Portfolio Optimizer has been redesigned as the central feature of the application, consolidating multiple optimization and analytics features into a single, comprehensive workspace. It replaces the previous standalone tabs for Block Optimizer, Efficient Frontier, Monte Carlo Simulator, Correlation Matrix, Position Sizing, and Comparison Blocks.

### Key Features

**1. Hierarchical Optimization**
- **Level 1**: Optimizes strategy weights within each selected block independently
- **Level 2**: Optimizes block allocation across the portfolio using Level 1 results
- Provides granular control over both intra-block and inter-block allocation
- Handles single-strategy blocks (automatically locked at 100%)

**2. Preset Management**
- Save and load optimization configurations (block selection, settings, capital)
- Stored in localStorage via `lib/hooks/use-optimization-presets.ts`
- Quick access to frequently-used configurations
- Maximum 50 presets stored

**3. Results History**
- All optimization runs are automatically saved to history
- Retrieve previous results when navigating away
- Stored in localStorage via `lib/hooks/use-optimization-history.ts`
- Maximum 50 historical entries stored
- Includes full results, timestamps, and metadata

**4. Integrated Analytics Tabs**
The Portfolio Optimizer includes six integrated tabs:
- **Results**: Hierarchical allocation table with CSV/clipboard export
- **Efficient Frontier**: Visualization of risk/return frontier (placeholder)
- **Monte Carlo**: Forward projections using optimized weights (placeholder)
- **Correlation**: Correlation heatmap of selected strategies (placeholder)
- **Kelly**: Kelly-optimal leverage recommendations (placeholder)
- **Comparison**: Before/after performance comparison (placeholder)

Note: Tabs marked as placeholder are UI-ready but need implementation of the actual analytics.

### File Structure

**Core Page**:
- `app/(platform)/portfolio-optimizer/page.tsx` - Main portfolio optimizer page

**Components**:
- `components/portfolio-optimizer/preset-selector.tsx` - Preset save/load UI
- `components/portfolio-optimizer/history-selector.tsx` - History load UI
- `components/portfolio-optimizer/two-level-controls.tsx` - Optimization settings
- `components/portfolio-optimizer/hierarchical-results.tsx` - Results display
- `components/portfolio-optimizer/tabs/*.tsx` - Integrated analytics tabs

**Hooks**:
- `lib/hooks/use-optimization-presets.ts` - Preset management
- `lib/hooks/use-optimization-history.ts` - History management

**Types**:
- `lib/types/portfolio-optimizer-types.ts` - OptimizationMode, OptimizationPreset, OptimizationHistoryEntry

**Utilities**:
- `lib/utils/optimization-export.ts` - CSV/JSON export functions

**Calculations** (existing):
- `lib/calculations/hierarchical-optimizer.ts` - Two-level optimization engine
- `lib/workers/hierarchical-optimization.worker.ts` - Web Worker for async processing

### Navigation Structure

The application now features a simplified navigation sidebar with 5 main items:
1. **Block Management** - Upload and manage trading data
2. **Block Stats** - Quick overview of a single block
3. **Portfolio Optimizer** - Central optimization hub (main feature)
4. **Performance Analysis** - Detailed charting (15+ charts in 5 tabs)
5. **Settings** - Application configuration

Legacy routes (block-optimizer, efficient-frontier, monte-carlo, etc.) remain accessible via direct links but are no longer in the main navigation.

### Data Model

The Portfolio Optimizer uses a **flat block structure** rather than nested hierarchies:
- Blocks are independent containers of trades
- Each trade has a strategy label (string)
- Hierarchy is simulated mathematically during optimization (not in data structure)
- This keeps the data model simple while providing powerful multi-level optimization

### Future Enhancements

Planned improvements to the integrated tabs:
1. **Efficient Frontier Tab**: Add Plotly chart showing risk/return curve
2. **Monte Carlo Tab**: Implement bootstrap resampling for forward projections
3. **Correlation Tab**: Integrate correlation matrix calculation and heatmap
4. **Kelly Tab**: Calculate and display Kelly-optimal leverage multipliers
5. **Comparison Tab**: Show equal-weight baseline vs optimized allocation comparison

Additional modes for single-block and multi-block (non-hierarchical) optimization may be added in the future.
