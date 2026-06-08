# 🗺️ EchoMap - Optimized Tech Stack & Architecture

## Executive Summary

**Problem:** Road infrastructure damage (potholes, cracks, etc.) causes vehicle damage and safety issues. Current reporting is manual and delayed.

**Solution:** EchoMap combines automatic sensor-based detection with community verification and real-time hazard mapping.

## 🏗️ Technology Stack

### Frontend
- **Framework**: React 18 + Vite
- **Map**: Leaflet + OpenStreetMap
- **State**: TanStack Query + Zustand
- **Real-time**: Supabase Real-time Subscriptions
- **Deployment**: Vercel

### Backend & Database
- **Database**: Supabase (PostgreSQL 15 + PostGIS)
- **Auth**: Supabase Auth (JWT)
- **Real-time**: Supabase Real-time (WebSocket)
- **API**: Supabase REST + RPC functions
- **Deployment**: Supabase Cloud

### AI/Classification Service
- **Runtime**: Node.js + Express
- **AI Model**: Claude 3 (Anthropic API)
- **Queue**: Bull + Redis
- **Deployment**: Railway or Render

### Infrastructure
```
┌─────────────────────────────────────────────────────────┐
│                    Users (Web/Mobile)                   │
│                                                         │
│  React + Vite + Leaflet + OpenStreetMap               │
│            (Deployed on Vercel)                        │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│  Supabase   │  │  Supabase   │  │  AI Service  │
│ PostgreSQL  │  │  Auth & RT  │  │ (Railway)    │
│  + PostGIS  │  │ Subscriptions│  │ + Claude API │
│             │  │             │  │              │
│ - Hazards   │  │ Real-time   │  │ Classification│
│ - Users     │  │ Updates     │  │ + Scoring    │
│ - Reports   │  │ WebSocket   │  │ + Heatmaps   │
│ - Heatmaps  │  │             │  │              │
└─────────────┘  └─────────────┘  └──────────────┘
```

## 📊 Database Schema (PostgreSQL + PostGIS)

### Core Tables

#### `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  vehicle_type TEXT CHECK (vehicle_type IN ('CAR', 'BIKE', 'BUS', 'TRUCK', 'PEDESTRIAN')),
  role TEXT DEFAULT 'USER' CHECK (role IN ('USER', 'AUTHORITY', 'ADMIN')),
  profile_picture_url TEXT,
  
  -- Statistics
  hazards_reported INT DEFAULT 0,
  hazards_verified INT DEFAULT 0,
  contribution_score INT DEFAULT 0,
  
  -- Location
  last_known_location GEOMETRY(POINT, 4326),
  
  -- Preferences
  notifications_enabled BOOLEAN DEFAULT TRUE,
  anonymous_reporting BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_email (email),
  INDEX idx_location (last_known_location)
);
```

#### `hazards`
```sql
CREATE TABLE hazards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Location (GeoJSON Point for spatial queries)
  location GEOMETRY(POINT, 4326) NOT NULL,
  address TEXT,
  
  -- Hazard Info
  hazard_type TEXT NOT NULL CHECK (hazard_type IN (
    'POTHOLE', 'DEEP_POTHOLE', 'CRACK', 'UNEVEN_ROAD', 
    'SPEED_BREAKER', 'DEBRIS', 'OTHER'
  )),
  severity INT CHECK (severity >= 1 AND severity <= 10),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Detection Source
  detection_method TEXT CHECK (detection_method IN (
    'AUTO_SENSOR', 'MANUAL_REPORT', 'AI_CLASSIFIED'
  )),
  sensor_data JSONB, -- {maxAccel, stdDev, gyro, etc}
  
  -- Status & Verification
  status TEXT DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'VERIFIED', 'FALSE_POSITIVE', 'RESOLVED', 'DUPLICATE'
  )),
  verification_count INT DEFAULT 0,
  verified_by UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- AI Classification
  ai_classification JSONB, -- {type, confidence, reasoning}
  ai_classified_at TIMESTAMP,
  ai_model_version TEXT,
  
  -- Images & Evidence
  image_urls TEXT[],
  
  -- Resolution
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days'),
  
  INDEX idx_location (location),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at DESC),
  INDEX idx_hazard_type (hazard_type)
);

-- Create spatial index for fast geospatial queries
CREATE INDEX idx_hazards_location_gist ON hazards USING GIST (location);
```

#### `verification_records`
```sql
CREATE TABLE verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hazard_id UUID REFERENCES hazards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  verification_type TEXT CHECK (verification_type IN ('VERIFIED', 'FALSE_POSITIVE', 'NEEDS_UPDATE')),
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(hazard_id, user_id),
  INDEX idx_hazard_id (hazard_id),
  INDEX idx_user_id (user_id)
);
```

#### `heatmap_tiles`
```sql
CREATE TABLE heatmap_tiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Geographic tile (H3 hex grid)
  h3_index TEXT NOT NULL UNIQUE,
  center_location GEOMETRY(POINT, 4326),
  
  -- Aggregated metrics
  hazard_count INT DEFAULT 0,
  avg_severity FLOAT,
  verified_count INT DEFAULT 0,
  
  -- Hazard type distribution
  hazard_type_counts JSONB, -- {POTHOLE: 5, CRACK: 3, ...}
  
  -- Time window
  date DATE NOT NULL,
  hour INT, -- Optional: hourly granularity
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_h3_index (h3_index),
  INDEX idx_date (date),
  INDEX idx_location (center_location)
);
```

### Key Features

✅ **PostGIS Integration**
- Geospatial queries: `ST_DWithin()`, `ST_Contains()`, `ST_Distance()`
- Efficient nearest-neighbor searches
- Heatmap tile generation

✅ **Real-time Subscriptions**
- Listen to new hazards in real-time
- Automatic updates when status changes
- Live verification count updates

✅ **Row-Level Security (RLS)**
```sql
-- Users can only see their own profile
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Anyone can view verified hazards
CREATE POLICY "Anyone can view verified hazards" ON hazards
  FOR SELECT USING (status = 'VERIFIED' OR status = 'PENDING');

-- Only authorities can resolve hazards
CREATE POLICY "Authorities can resolve hazards" ON hazards
  FOR UPDATE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'AUTHORITY'
  );
```

## 🔌 API Endpoints (Supabase REST + RPC)

### Hazard Management
```
GET    /rest/v1/hazards
       Query params: latitude, longitude, radius, type, status, limit, offset
       Returns: GeoJSON FeatureCollection

POST   /rest/v1/hazards
       Body: {location, hazard_type, severity, detection_method, sensor_data}
       Returns: Created hazard

GET    /rest/v1/hazards/:id
       Returns: Full hazard details with verification history

PUT    /rest/v1/hazards/:id
       Body: {status, resolution_notes}
       Returns: Updated hazard

POST   /rest/v1/hazards/:id/verify
       Returns: Updated verification count

POST   /rpc/get_nearby_hazards
       Params: {lat, lng, radius_km, limit}
       Returns: Nearby hazards sorted by distance
```

### Heatmap Data
```
GET    /rest/v1/heatmap_tiles
       Query params: bounds (bbox), date, granularity
       Returns: Aggregated hazard statistics

POST   /rpc/generate_heatmap
       Triggers materialized view refresh
```

### Real-time Subscriptions (WebSocket)
```javascript
// New hazards in area
supabase
  .channel('hazards')
  .on('postgres_changes', 
    {event: 'INSERT', schema: 'public', table: 'hazards'},
    (payload) => console.log('New hazard:', payload)
  )
  .subscribe()

// Status updates
supabase
  .channel(`hazard:${hazardId}`)
  .on('postgres_changes',
    {event: 'UPDATE', schema: 'public', table: 'hazards'},
    (payload) => console.log('Hazard updated:', payload)
  )
  .subscribe()
```

## 🤖 AI Classification Service (Node.js on Railway)

### Purpose
- Classify sensor data into hazard types
- Score confidence levels
- Suggest severity ratings
- Detect duplicates

### Architecture
```
Mobile/Web App
    ↓
Hazard Submitted to Supabase
    ↓
Webhook Trigger (Supabase -> Railway)
    ↓
AI Service (Node.js + Express)
    ├─ Parse sensor data
    ├─ Call Claude API
    ├─ Classify hazard type
    └─ Store results in Supabase
    ↓
Real-time Update to Users
```

### Claude Prompt
```
You are an expert road infrastructure analyst. Analyze the following sensor data and road conditions.

Sensor Data:
- Max Acceleration: {maxAccel}g
- Std Deviation: {stdDev}
- Gyroscope Z-axis: {gyroZ}
- Duration: {duration}ms
- Vehicle Type: {vehicleType}
- Speed: {speed} km/h

Historical Context:
- Similar events in this area: {similarCount}
- Nearby hazards: {nearbyHazards}

Provide:
1. Hazard Type: One of [POTHOLE, DEEP_POTHOLE, CRACK, UNEVEN_ROAD, SPEED_BREAKER, DEBRIS, FALSE_POSITIVE]
2. Confidence: 0-100 score
3. Severity: 1-10 rating
4. Reasoning: Brief explanation
5. Recommendations: Suggested actions

Respond in JSON format.
```

## 📱 Frontend Components (React + Vite)

### Component Tree
```
App
├── Layout
│   ├── Header
│   ├── Sidebar
│   └── Footer
│
├── Pages
│   ├── Map
│   │   ├── LeafletMap
│   │   ├── HazardMarkers
│   │   ├── HeatmapLayer
│   │   └── Controls
│   │
│   ├── Dashboard
│   │   ├── StatsCard
│   │   ├── RecentHazards
│   │   └── TrendChart
│   │
│   ├── ReportHazard
│   │   ├── SensorDataForm
│   │   ├── LocationPicker
│   │   ├── ImageUpload
│   │   └── Preview
│   │
│   ├── HazardDetail
│   │   ├── HazardInfo
│   │   ├── VerificationList
│   │   ├── AIAnalysis
│   │   └── Actions
│   │
│   └── AuthPages
│       ├── Login
│       ├── Register
│       └── Profile

└── Services
    ├── supabaseClient
    ├── hooks/
    │   ├── useHazards
    │   ├── useRealtime
    │   ├── useAuth
    │   └── useGeolocation
    └── utils/
        ├── mapUtils
        ├── geoUtils
        └── formatters
```

## 🚀 Deployment

### Frontend (Vercel)
```yaml
# vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "env": {
    "VITE_SUPABASE_URL": "@supabase_url",
    "VITE_SUPABASE_ANON_KEY": "@supabase_anon_key",
    "VITE_RAILWAY_API_URL": "@railway_api_url"
  }
}
```

### AI Service (Railway)
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Setup
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI Service (Railway)
RAILWAY_TOKEN=xxxxx
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://...

# Webhooks
SUPABASE_WEBHOOK_SECRET=xxxxx
```

## 📈 Performance Optimizations

### Database
- ✅ Geospatial indexes (GIST)
- ✅ Partial indexes on status
- ✅ Materialized views for heatmaps
- ✅ Connection pooling (PgBouncer)

### Frontend
- ✅ Code splitting with Vite
- ✅ Map layer caching
- ✅ Infinite scroll for hazard lists
- ✅ Virtual scrolling for large lists

### Real-time
- ✅ Selective subscriptions (only visible area)
- ✅ Message debouncing
- ✅ Batch updates

## 🔐 Security

### Authentication
- ✅ Supabase Auth (OAuth2, JWT)
- ✅ Row-Level Security (RLS)
- ✅ Secure JWT tokens

### Data Protection
- ✅ HTTPS everywhere
- ✅ Rate limiting (100 req/min per user)
- ✅ Input validation & sanitization
- ✅ CORS configured

### Privacy
- ✅ Anonymous reporting option
- ✅ GDPR-compliant data deletion
- ✅ Personal data encryption at rest

## 📊 Scalability

### Database
- PostgreSQL can handle 100K+ records/day
- Sharding on `hazard_type` or date for ultra-scale

### Real-time
- Supabase handles 10K+ concurrent connections
- Message routing optimized by geography

### API
- Supabase REST API auto-scales
- AI Service can scale horizontally on Railway

## 🗺️ Roadmap

### Phase 1 (MVP)
- ✅ Hazard reporting & mapping
- ✅ Real-time updates
- ✅ Community verification
- ✅ Basic heatmaps

### Phase 2
- 🔄 AI classification
- 🔄 Authority dashboard
- 🔄 Mobile app (React Native)

### Phase 3
- 📋 Predictive maintenance
- 📋 City integration APIs
- 📋 Advanced analytics

---

**This architecture is production-ready, scalable, and cost-effective!**
