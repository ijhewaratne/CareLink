# Non-Clinical Service Disclaimer

## Overview

This document defines the mandatory non-clinical disclaimer that must be displayed to all users before they can request care services through the CareLink platform.

**Purpose:**
- Ensure users understand the scope of services
- Prevent misuse of the platform for medical emergencies
- Comply with Apple App Store and Google Play Store requirements
- Mitigate legal liability

---

## Mandatory Onboarding Screen

### UI Specification

**Screen Type:** Full-screen modal (cannot be dismissed without acknowledgment)
**Trigger:** First app launch + after app updates
**Persistence:** User acceptance stored in `User.hasAcceptedServiceScope`

### Copy (English - Sri Lanka)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              Understanding CareLink Services                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CareLink is a logistics and scheduling platform           │
│  connecting you with verified care companions.              │
│                                                             │
│  ⚠️ IMPORTANT                                               │
│                                                             │
│  CareLink companions provide NON-CLINICAL assistance        │
│  only, including:                                           │
│                                                             │
│  ✅ Companionship and emotional support                     │
│  ✅ Mobility assistance (walking, transfers)                │
│  ✅ Communication with hospital staff                       │
│  ✅ Meal assistance (feeding, ordering food)                │
│  ✅ Personal care (bathing, dressing)                       │
│  ✅ Medication reminders (NOT administration)               │
│                                                             │
│  ❌ STRICTLY PROHIBITED:                                    │
│                                                             │
│  ❌ Administering medication                                │
│  ❌ Changing wound dressings                                │
│  ❌ Performing medical procedures                           │
│  ❌ Emergency medical response                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  By continuing, you acknowledge that:                       │
│                                                             │
│  • CareLink is NOT a medical provider                       │
│  • CareLink is NOT an emergency service                     │
│  • Care companions are NOT licensed medical professionals   │
│  • For medical emergencies, call 1990 or go to ER           │
│                                                             │
│  [ ] I understand and agree to the Scope of Service         │
│                                                             │
│              [ Continue ] (disabled until checked)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Copy (Sinhala)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              CareLink සේවා පිළිබඳ අවබෝධය                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CareLink යනු තහවුරු කරන ලද සහායකයින් සමඟ ඔබව සම්බන්ධ      │
│  කරන ලජිස්ටික්ස් හා කාලසටහන් ප්‍රදාන ප්‍රචාරක වේදිකාවකි.   │
│                                                             │
│  ⚠️ වැදගත්                                                   │
│                                                             │
│  CareLink සහායකයින් පහත සේවා පමණික් සපයයි:                 │
│                                                             │
│  ✅ සහජීවනය හා හැඟීම්මය සහාය                               │
│  ✅ චලන සහාය (ඇවිදීම, මාරුවීම්)                             │
│  ✅ රෝහල් කාර්ය මණ්ඩලය සමඟ සන්නිවේදනය                       │
│  ✅ ආහාර සහාය (කෑම, ආහාර ඇණවුම්)                            │
│  ✅ පුද්ගලික සත්කාර (නෑම, ඇඳුම් අඳීම)                       │
│  ✅ ඖෂධ මතක් කිරීම් (දීම නොවේ)                              │
│                                                             │
│  ❌ දැඩිව තහනම්:                                             │
│                                                             │
│  ❌ ඖෂධ ලබා දීම                                             │
│  ❌ තුවාල ඇඳීම් වෙනස් කිරීම                                  │
│  ❌ වෛද්‍ය ක්‍රියා පටිපාටි                                    │
│  ❌ හදිසි වෛද්‍ය ප්‍රතිචාර                                   │
│                                                             │
│  [ ] මම සේවා විෂය පරාසය තේරුම් කර සමතුන්නෙමි                 │
│                                                             │
│              [ ඉදිරියට යන්න ]                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Copy (Tamil)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              CareLink சேவைகளைப் புரிந்துகொள்ளுதல்           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CareLink என்பது சரிபார்க்கப்பட்ட பராமரிப்பு உதவியாளர்களுடன்│
│  உங்களை இணைக்கும் ஒரு திட்டமிடல் மற்றும் ஏற்பாடு            │
│  தளமாகும்.                                                  │
│                                                             │
│  ⚠️ முக்கியம்                                                │
│                                                             │
│  CareLink உதவியாளர்கள் பின்வரும் சேவைகளை மட்டுமே            │
│  வழங்குகிறார்கள்:                                           │
│                                                             │
│  ✅ துணை மற்றும் உணர்வுப்பூர்வ ஆதரவு                        │
│  ✅ நகர்வு உதவி (நடத்தல், மாற்றுதல்)                         │
│  ✅ மருத்துவமனை ஊழியர்களுடன் தொடர்பு                        │
│  ✅ உணவு உதவி (உண்ணுதல், உணவு ஆர்டர்)                       │
│  ✅ தனிப்பட்ட பராமரிப்பு (குளித்தல், உடை அணிதல்)             │
│  ✅ மருந்து நினைவூட்டல்கள் (வழங்குதல் அல்ல)                 │
│                                                             │
│  ❌ கண்டிப்பாகத் தடைசெய்யப்பட்டது:                          │
│                                                             │
│  ❌ மருந்து வழங்குதல்                                        │
│  ❌ காய ஆடைகளை மாற்றுதல்                                     │
│  ❌ மருத்துவ செயல்முறைகள்                                    │
│  ❌ அவசர மருத்துவ பதில்                                     │
│                                                             │
│  [ ] நான் சேவை வரம்பைப் புரிந்து ஒப்புக்கொள்கிறேன்         │
│                                                             │
│              [ தொடரவும் ]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### Database Schema Update

Add to `User` model in Prisma schema:

```prisma
model User {
  // ... existing fields ...
  
  /// Tracks if user has accepted the non-clinical service scope
  /// Required before creating any bookings
  hasAcceptedServiceScope Boolean @default(false) @map("has_accepted_service_scope")
  acceptedServiceScopeAt  DateTime? @map("accepted_service_scope_at")
  
  // ... rest of model ...
}
```

### Migration SQL

```sql
-- Add acceptance tracking columns
ALTER TABLE users 
ADD COLUMN has_accepted_service_scope BOOLEAN DEFAULT FALSE,
ADD COLUMN accepted_service_scope_at TIMESTAMP;

-- Create index for checking acceptance status
CREATE INDEX idx_users_acceptance_status 
ON users(has_accepted_service_scope) 
WHERE has_accepted_service_scope = FALSE;
```

### API Endpoints

#### POST /api/v1/users/me/accept-service-scope

Accept the non-clinical service scope disclaimer.

**Request:**
```json
{
  "accepted": true,
  "acceptedAt": "2024-03-15T08:30:00Z"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "hasAcceptedServiceScope": true,
    "acceptedAt": "2024-03-15T08:30:00Z"
  }
}
```

**Middleware Check:**

```typescript
// middleware/serviceScope.middleware.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';

export async function requireServiceScopeAcceptance(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  
  if (!userId) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
    return;
  }
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hasAcceptedServiceScope: true }
  });
  
  if (!user?.hasAcceptedServiceScope) {
    res.status(403).json({
      success: false,
      error: {
        code: 'SERVICE_SCOPE_NOT_ACCEPTED',
        message: 'You must accept the service scope disclaimer before using CareLink services',
        action: 'SHOW_DISCLAIMER'
      }
    });
    return;
  }
  
  next();
}
```

**Route Protection:**

```typescript
// routes/booking.routes.ts
import { requireServiceScopeAcceptance } from '../middleware/serviceScope.middleware';

router.post(
  '/match',
  authenticate,
  requireServiceScopeAcceptance,  // ← Must accept disclaimer first
  createBookingMatchHandler
);
```

---

## Flutter App Implementation

### Service Scope Screen

```dart
// lib/screens/onboarding/service_scope_screen.dart
import 'package:flutter/material.dart';

class ServiceScopeScreen extends StatefulWidget {
  @override
  _ServiceScopeScreenState createState() => _ServiceScopeScreenState();
}

class _ServiceScopeScreenState extends State<ServiceScopeScreen> {
  bool _isChecked = false;
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Title
              Text(
                'Understanding CareLink Services',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              SizedBox(height: 16),
              
              // Description
              Text(
                'CareLink is a logistics and scheduling platform connecting you with verified care companions.',
              ),
              SizedBox(height: 24),
              
              // Warning
              Container(
                padding: EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '⚠️ IMPORTANT',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'CareLink companions provide NON-CLINICAL assistance only:',
                    ),
                    SizedBox(height: 8),
                    _buildBulletPoint('Companionship and emotional support'),
                    _buildBulletPoint('Mobility assistance'),
                    _buildBulletPoint('Communication with hospital staff'),
                    _buildBulletPoint('Meal assistance'),
                    SizedBox(height: 8),
                    Text(
                      'STRICTLY PROHIBITED: Administering medication, changing wound dressings, performing medical procedures.',
                      style: TextStyle(color: Colors.red),
                    ),
                  ],
                ),
              ),
              
              Spacer(),
              
              // Checkbox
              CheckboxListTile(
                value: _isChecked,
                onChanged: (value) => setState(() => _isChecked = value ?? false),
                title: Text('I understand and agree to the Scope of Service'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              
              SizedBox(height: 16),
              
              // Continue Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isChecked ? _onContinue : null,
                  child: Text('Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
  
  Widget _buildBulletPoint(String text) {
    return Padding(
      padding: EdgeInsets.only(left: 16, bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('✅ '),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
  
  void _onContinue() async {
    // Call API to record acceptance
    await ref.read(userServiceProvider).acceptServiceScope();
    
    // Navigate to home
    Navigator.of(context).pushReplacementNamed('/home');
  }
}
```

---

## Testing Checklist

### Backend Tests

```typescript
// tests/integration/service-scope.test.ts
describe('Service Scope Acceptance', () => {
  it('should reject booking creation if user has not accepted service scope', async () => {
    const user = await createTestUser({ hasAcceptedServiceScope: false });
    
    const response = await request(app)
      .post('/api/v1/bookings/match')
      .set('Authorization', `Bearer ${user.token}`)
      .send(validBookingData);
    
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SERVICE_SCOPE_NOT_ACCEPTED');
  });
  
  it('should allow booking creation after user accepts service scope', async () => {
    const user = await createTestUser({ hasAcceptedServiceScope: true });
    
    const response = await request(app)
      .post('/api/v1/bookings/match')
      .set('Authorization', `Bearer ${user.token}`)
      .send(validBookingData);
    
    expect(response.status).toBe(201);
  });
});
```

### Flutter Tests

```dart
// test/screens/service_scope_screen_test.dart
testWidgets('Continue button disabled until checkbox checked', (tester) async {
  await tester.pumpWidget(MaterialApp(home: ServiceScopeScreen()));
  
  // Initially, continue button should be disabled
  final continueButton = find.widgetWithText(ElevatedButton, 'Continue');
  expect(tester.widget<ElevatedButton>(continueButton).enabled, false);
  
  // Tap checkbox
  await tester.tap(find.byType(Checkbox));
  await tester.pump();
  
  // Now button should be enabled
  expect(tester.widget<ElevatedButton>(continueButton).enabled, true);
});
```

---

## Legal Review Requirements

Before deployment, this disclaimer must be reviewed by:

1. **Legal counsel** - Verify liability protection
2. **Medical advisor** - Confirm scope of services is accurate
3. **Insurance provider** - Ensure coverage aligns with disclaimer
4. **Apple App Store reviewer** - Pre-submission review

---

## Related Documents

- `EMERGENCY_PROTOCOL.md` - Emergency button behavior
- `TERMS_OF_SERVICE.md` - Full terms and conditions
- `PRIVACY_POLICY.md` - PDPA compliance documentation
