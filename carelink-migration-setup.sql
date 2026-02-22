-- =============================================================================
-- CareLink Database Migration Setup
-- PostgreSQL with PostGIS and Encryption Support
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================================================
-- ENCRYPTION FUNCTIONS FOR NIC
-- =============================================================================

-- Function to encrypt NIC number
CREATE OR REPLACE FUNCTION encrypt_nic(nic_text TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_encrypt(nic_text, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrypt NIC number
CREATE OR REPLACE FUNCTION decrypt_nic(encrypted_nic TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(encrypted_nic::bytea, encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate NIC hash for deduplication
CREATE OR REPLACE FUNCTION hash_nic(nic_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(nic_text || '${NIC_PEPPER}', 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GEOSPATIAL HELPER FUNCTIONS
-- =============================================================================

-- Function to find nearby providers
CREATE OR REPLACE FUNCTION find_nearby_providers(
    search_lat DOUBLE PRECISION,
    search_lng DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 10000,
    skill_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
    provider_id UUID,
    full_name VARCHAR,
    trust_score DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    skill_trust_score DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.user_id,
        p.full_name,
        p.trust_score,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography) as distance_meters,
        ps.skill_trust_score
    FROM profiles p
    INNER JOIN provider_skills ps ON ps.provider_id = p.user_id
    INNER JOIN service_categories sc ON sc.id = ps.service_category_id
    WHERE 
        p.is_available = true
        AND p.location IS NOT NULL
        AND ST_DWithin(
            p.location, 
            ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography, 
            radius_meters
        )
        AND (skill_slug IS NULL OR sc.slug = skill_slug)
        AND ps.is_active = true
    ORDER BY 
        ps.skill_trust_score DESC,
        distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to find nearby bookings for providers
CREATE OR REPLACE FUNCTION find_nearby_bookings(
    provider_lat DOUBLE PRECISION,
    provider_lng DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 10000,
    skill_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
    booking_id UUID,
    booking_reference VARCHAR,
    location_address VARCHAR,
    scheduled_date DATE,
    distance_meters DOUBLE PRECISION,
    base_amount DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.booking_reference,
        b.location_address,
        b.scheduled_date,
        ST_Distance(b.location_geo, ST_SetSRID(ST_MakePoint(provider_lng, provider_lat), 4326)::geography) as distance_meters,
        b.base_amount
    FROM bookings b
    INNER JOIN service_categories sc ON sc.id = b.service_category_id
    WHERE 
        b.status = 'PENDING'
        AND b.location_geo IS NOT NULL
        AND ST_DWithin(
            b.location_geo, 
            ST_SetSRID(ST_MakePoint(provider_lng, provider_lat), 4326)::geography, 
            radius_meters
        )
        AND (skill_slug IS NULL OR sc.slug = skill_slug)
    ORDER BY 
        b.scheduled_date ASC,
        distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRUST SCORE CALCULATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_provider_trust_score(provider_id UUID)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    completion_rate DOUBLE PRECISION;
    avg_rating DOUBLE PRECISION;
    verification_score DOUBLE PRECISION;
    response_score DOUBLE PRECISION;
BEGIN
    -- Calculate completion rate (40% weight)
    SELECT 
        COALESCE(
            COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::DOUBLE PRECISION / 
            NULLIF(COUNT(*), 0),
            0
        ) * 100
    INTO completion_rate
    FROM bookings
    WHERE provider_id = provider_id;
    
    -- Calculate average rating (30% weight)
    SELECT COALESCE(AVG(rating), 0) * 20
    INTO avg_rating
    FROM reviews
    WHERE target_id = provider_id;
    
    -- Calculate verification score (20% weight)
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END)::DOUBLE PRECISION / COUNT(*) * 100
        END
    INTO verification_score
    FROM verification_docs
    WHERE user_id = provider_id;
    
    -- Calculate response score based on response time (10% weight)
    SELECT 
        CASE 
            WHEN response_time_min IS NULL THEN 50
            WHEN response_time_min <= 15 THEN 100
            WHEN response_time_min <= 30 THEN 80
            WHEN response_time_min <= 60 THEN 60
            ELSE 40
        END
    INTO response_score
    FROM profiles
    WHERE user_id = provider_id;
    
    -- Return weighted trust score
    RETURN (completion_rate * 0.4) + (avg_rating * 0.3) + (verification_score * 0.2) + (response_score * 0.1);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SOFT DELETE VIEWS
-- =============================================================================

-- View for active users only
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users WHERE deleted_at IS NULL;

-- View for active bookings only
CREATE OR REPLACE VIEW active_bookings AS
SELECT * FROM bookings WHERE deleted_at IS NULL;

-- =============================================================================
-- AUDIT TRIGGER FUNCTIONS
-- =============================================================================

-- Trigger function to log profile updates
CREATE OR REPLACE FUNCTION log_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        NEW.user_id,
        'PROFILE_UPDATED',
        'Profile',
        NEW.id,
        row_to_json(OLD)::TEXT,
        row_to_json(NEW)::TEXT
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to log booking status changes
CREATE OR REPLACE FUNCTION log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            old_values,
            new_values
        ) VALUES (
            COALESCE(NEW.provider_id, NEW.customer_id),
            'BOOKING_STATUS_CHANGED',
            'Booking',
            NEW.id,
            json_build_object('status', OLD.status)::TEXT,
            json_build_object('status', NEW.status)::TEXT
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INDEX OPTIMIZATION
-- =============================================================================

-- Additional composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status_date 
ON bookings(customer_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_bookings_provider_status_date 
ON bookings(provider_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_provider_skills_category_trust 
ON provider_skills(service_category_id, is_active, skill_trust_score DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_target_visible 
ON reviews(target_id, is_visible, created_at DESC);

-- Partial indexes for active records
CREATE INDEX IF NOT EXISTS idx_profiles_available_trust 
ON profiles(is_available, trust_score DESC) 
WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_bookings_pending_geo 
ON bookings(location_geo) 
WHERE status = 'PENDING';

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Sri Lanka Districts
INSERT INTO districts (id, name_en, name_si, name_ta, province) VALUES
    (gen_random_uuid(), 'Colombo', 'කොළඹ', 'கொழும்பு', 'Western'),
    (gen_random_uuid(), 'Gampaha', 'ගම්පහ', 'கம்பஹா', 'Western'),
    (gen_random_uuid(), 'Kalutara', 'කළුතර', 'களுத்துறை', 'Western'),
    (gen_random_uuid(), 'Kandy', 'මහනුවර', 'கண்டி', 'Central'),
    (gen_random_uuid(), 'Matale', 'මාතලේ', 'மாத்தளை', 'Central'),
    (gen_random_uuid(), 'Nuwara Eliya', 'නුවරඑළිය', 'நுவராஎலியா', 'Central'),
    (gen_random_uuid(), 'Galle', 'ගාල්ල', 'காலி', 'Southern'),
    (gen_random_uuid(), 'Matara', 'මාතර', 'மாத்தறை', 'Southern'),
    (gen_random_uuid(), 'Hambantota', 'හම්බන්තොට', 'ஹம்பாந்தோட்டை', 'Southern'),
    (gen_random_uuid(), 'Jaffna', 'යාපනය', 'யாழ்ப்பாணம்', 'Northern'),
    (gen_random_uuid(), 'Kilinochchi', 'කිලිනොච්චි', 'கிளிநொச்சி', 'Northern'),
    (gen_random_uuid(), 'Mannar', 'මන්නාරම', 'மன்னார்', 'Northern'),
    (gen_random_uuid(), 'Vavuniya', 'වවුනියාව', 'வவுனியா', 'Northern'),
    (gen_random_uuid(), 'Mullaitivu', 'මුලතිව්', 'முல்லைத்தீவு', 'Northern'),
    (gen_random_uuid(), 'Batticaloa', 'මඩකලපුව', 'மட்டக்களப்பு', 'Eastern'),
    (gen_random_uuid(), 'Ampara', 'අම්පාර', 'அம்பாறை', 'Eastern'),
    (gen_random_uuid(), 'Trincomalee', 'ත්‍රිකුණාමලය', 'திருகோணமலை', 'Eastern'),
    (gen_random_uuid(), 'Kurunegala', 'කුරුණෑගල', 'குருணாகல்', 'North Western'),
    (gen_random_uuid(), 'Puttalam', 'පුත්තලම', 'புத்தளம்', 'North Western'),
    (gen_random_uuid(), 'Anuradhapura', 'අනුරාධපුරය', 'அனுராதபுரம்', 'North Central'),
    (gen_random_uuid(), 'Polonnaruwa', 'පොළොන්නරුව', 'பொலன்னறுவை', 'North Central'),
    (gen_random_uuid(), 'Badulla', 'බදුල්ල', 'பதுளை', 'Uva'),
    (gen_random_uuid(), 'Monaragala', 'මොණරාගල', 'மொணராகலை', 'Uva'),
    (gen_random_uuid(), 'Ratnapura', 'රත්නපුර', 'இரத்தினபுரி', 'Sabaragamuwa'),
    (gen_random_uuid(), 'Kegalle', 'කෑගල්ල', 'கேகாலை', 'Sabaragamuwa')
ON CONFLICT (name_en) DO NOTHING;

-- Initial Service Categories
INSERT INTO service_categories (
    id, slug, name_en, name_si, description, short_description,
    base_price, price_unit, required_capabilities, min_duration_hours,
    requires_verification, display_order
) VALUES 
    (
        gen_random_uuid(),
        'hospital-companion',
        'Hospital Companion',
        'රෝහල් සහායක',
        'Non-clinical assistance for care recipients in hospital settings. Includes companionship, mobility assistance, meal support, and communication with family.',
        'Hospital companionship and non-clinical care assistance',
        500.00,
        'per_hour',
        '["hospital_companion", "mobility_assistance", "communication"]',
        4,
        '{"NIC_FRONT", "NIC_BACK", "POLICE_CLEARANCE"}',
        1
    ),
    (
        gen_random_uuid(),
        'home-care-assistant',
        'Home Care Assistant',
        'ගෘහස්ථ සේවක',
        'In-home assistance for daily living activities. Includes personal care, meal preparation, medication reminders, and light housekeeping.',
        'In-home daily living assistance',
        600.00,
        'per_hour',
        '["home_care", "personal_assistance", "meal_preparation"]',
        4,
        '{"NIC_FRONT", "NIC_BACK", "POLICE_CLEARANCE", "MEDICAL_CERTIFICATE"}',
        2
    ),
    (
        gen_random_uuid(),
        'elderly-companion',
        'Elderly Companion',
        'වැඩිහිටි සහායක',
        'Companionship and assistance for elderly individuals. Includes conversation, accompaniment to appointments, and light assistance.',
        'Elderly companionship and support',
        450.00,
        'per_hour',
        '["elderly_care", "companionship", "communication"]',
        2,
        '{"NIC_FRONT", "NIC_BACK", "POLICE_CLEARANCE"}',
        3
    ),
    (
        gen_random_uuid(),
        'mobility-assistant',
        'Mobility Assistant',
        'චලන සහායක',
        'Specialized assistance for individuals with mobility challenges. Includes wheelchair assistance, transfer support, and safe movement.',
        'Mobility and transfer assistance',
        700.00,
        'per_hour',
        '["mobility_assistance", "transfer_support", "safety_awareness"]',
        3,
        '{"NIC_FRONT", "NIC_BACK", "POLICE_CLEARANCE", "TRAINING_CERT"}',
        4
    )
ON CONFLICT (slug) DO NOTHING;

-- System Configuration
INSERT INTO system_config (key, value, data_type, description) VALUES
    ('platform_fee_percentage', '10', 'number', 'Platform fee as percentage of booking amount'),
    ('minimum_booking_hours', '2', 'number', 'Minimum booking duration in hours'),
    ('provider_response_timeout_minutes', '30', 'number', 'Time for provider to respond to booking request'),
    ('booking_cancellation_hours', '24', 'number', 'Hours before booking when cancellation is allowed without penalty'),
    ('trust_score_threshold', '70', 'number', 'Minimum trust score for provider to be auto-matched'),
    ('default_search_radius_km', '10', 'number', 'Default search radius in kilometers'),
    ('max_search_radius_km', '50', 'number', 'Maximum search radius in kilometers'),
    ('encryption_key_version', '1', 'string', 'Current encryption key version for PII'),
    ('data_retention_days', '2555', 'number', 'Number of days to retain user data after account deletion (7 years)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
