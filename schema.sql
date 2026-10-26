-- Run this script in the dedicated Neon database before enabling the Vercel API.
CREATE TABLE IF NOT EXISTS enquiries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  interest VARCHAR(80) NOT NULL,
  location VARCHAR(120),
  budget VARCHAR(80),
  details VARCHAR(1000),
  consent_at TIMESTAMPTZ NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'homepage',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC);

CREATE TABLE IF NOT EXISTS properties (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug VARCHAR(180) UNIQUE NOT NULL,
  title VARCHAR(180) NOT NULL,
  property_type VARCHAR(50) NOT NULL CHECK (property_type IN ('Plot / Land','House','Flat / Apartment','Commercial property','Other')),
  locality VARCHAR(120),
  district VARCHAR(120),
  state VARCHAR(120),
  asking_price NUMERIC(16,2) CHECK (asking_price IS NULL OR asking_price >= 0),
  area_value NUMERIC(16,3) CHECK (area_value IS NULL OR area_value >= 0),
  area_unit VARCHAR(20),
  summary VARCHAR(300),
  description VARCHAR(3000),
  photo_url TEXT,
  photo_alt VARCHAR(250),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (photo_url IS NULL OR photo_url LIKE 'https://%')
);
CREATE INDEX IF NOT EXISTS properties_public_listing_idx ON properties (is_active, admin_approved, featured, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_location_idx ON properties (district, locality);
-- No sample or dummy properties are inserted. New records stay unpublished until explicitly approved and activated.
