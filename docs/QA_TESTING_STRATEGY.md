# CareLink QA Testing Strategy

## Overview

This document outlines the minimum hardware stack and testing procedures required to validate CareLink before App Store submission.

---

## Minimum Hardware Stack for Launch

### Primary iOS Device

| Specification | Requirement |
|--------------|-------------|
| **Device** | iPhone 12 or newer |
| **iOS Version** | iOS 16+ |
| **Why Required** | Testing stricter App Tracking Transparency and "Always Allow" location flows |

**Critical Tests:**
- App Tracking Transparency prompt behavior
- "Allow Once" vs "Allow While Using" vs "Always Allow" location flows
- Background location tracking accuracy
- Push notification delivery in background
- Camera/document upload functionality

**Recommended Models:**
- iPhone 12 (most cost-effective)
- iPhone 13/14 (better camera for testing document upload)
- iPhone SE 3 (budget option, but test on newer device too)

---

### Primary Android Device

| Specification | Requirement |
|--------------|-------------|
| **Device** | Mid-range Samsung or Xiaomi |
| **Android Version** | Android 12+ (API 31+) |
| **Why Required** | Android 12+ introduced aggressive battery-saving features that kill background location |

**Critical Tests:**
- Background location tracking under battery saver mode
- Foreground service persistence
- Doze mode behavior
- App kill/restart behavior
- Permission rationale flows

**Recommended Models:**
- Samsung Galaxy A54 (excellent for testing Samsung-specific battery optimizations)
- Xiaomi Redmi Note 12 (tests MIUI aggressive battery management)
- Google Pixel 6a (reference Android experience)

---

### Development Mac

| Specification | Requirement |
|--------------|-------------|
| **Device** | Mac Mini (M1/M2/M3) or MacBook |
| **Why Required** | Compiling Flutter code into iOS .ipa via Xcode |
| **Minimum Spec** | 8GB RAM, 256GB SSD |
| **Recommended Spec** | 16GB RAM, 512GB SSD |

**Required Software:**
- macOS Ventura (13.0) or newer
- Xcode 15.0 or newer
- Flutter SDK 3.16.0 or newer
- CocoaPods
- Android Studio (for Android builds)

---

## Test Device Matrix

| Device | OS Version | Primary Purpose | Priority |
|--------|------------|-----------------|----------|
| iPhone 12/13/14 | iOS 16+ | Location permissions, background tracking | **P0 - Required** |
| Samsung Galaxy A54 | Android 13+ | Battery optimization testing | **P0 - Required** |
| Xiaomi Redmi Note 12 | Android 12+ | Aggressive battery killer testing | **P1 - Recommended** |
| iPad (any) | iPadOS 16+ | Tablet UI testing | P2 - Optional |
| Low-end Android (Android 10) | Android 10 | Backward compatibility | P2 - Optional |

---

## Critical Test Scenarios

### 1. Location Permission Flows

#### iOS Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| First-time location request | Fresh install → Open app → Tap "Find Providers" | Pre-prompt disclosure shown first |
| "Allow Once" selection | Permission prompt → Select "Allow Once" | Location works for this session only |
| "Allow While Using" selection | Permission prompt → Select "Allow While Using App" | Location works while app in foreground |
| "Don't Allow" selection | Permission prompt → Select "Don't Allow" | App shows limited functionality screen |
| Background location upgrade | Settings → Location → Change to "Always" | Provider can track shifts in background |
| Permission revocation | Settings → Location → Select "Never" | App gracefully degrades functionality |

#### Android Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| First-time location request | Fresh install → Open app | Pre-prompt disclosure shown first |
| Precise location grant | Permission prompt → "Allow" | High-accuracy location available |
| Approximate location grant | Permission prompt → "Approximate" | Low-accuracy location (warn user) |
| Background location request | Provider app → Accept shift | Additional prompt for background location |
| Battery saver mode | Enable battery saver → Start shift | Foreground service persists, location updates continue |
| Doze mode | Leave device idle during shift | Location updates resume after doze exit |
| App kill by system | Use app → Background → System kills | Shift tracking resumes on restart (if within shift time) |

---

### 2. Firebase Phone OTP Flow

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Valid phone number | Enter "0771234567" → Tap "Send OTP" | OTP sent, code entry screen shown |
| Auto-formatting | Type "771234567" | Formats to "077 123 4567" |
| Invalid phone number | Enter "12345" → Tap "Send OTP" | Validation error shown |
| International format | Enter "+94771234567" | Normalized correctly, OTP sent |
| Correct OTP entry | Enter valid 6-digit code | User authenticated, navigated to home |
| Incorrect OTP entry | Enter wrong code | Error message, retry allowed |
| Resend OTP | Tap "Resend" after 60s | New OTP sent |
| Network failure | Enable airplane mode → Send OTP | Error message, retry option |
| reCAPTCHA verification | Trigger on web/emulator | Invisible reCAPTCHA completes |

---

### 3. Background Location Tracking (Provider App)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Shift start tracking | Accept booking → Tap "Start Shift" | Location tracking begins, notification shows |
| Background tracking | Start shift → Press home button | Tracking continues, notification persists |
| App kill during shift | Start shift → Swipe away app | Tracking resumes via foreground service |
| Device restart during shift | Start shift → Restart device | Tracking resumes after reboot (if shift active) |
| Battery saver impact | Enable battery saver → Track for 30 min | Location updates may be less frequent but continue |
| Network loss during tracking | Enable airplane mode → Drive around | Locations queued, sent when network returns |
| ETA calculation | Track movement toward hospital | ETA updates in real-time for customer |
| Shift end tracking | Tap "Complete Shift" | Tracking stops, notification removed |

---

### 4. Emergency Button Flow

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Emergency during shift | Active shift → Tap emergency button | Native dialer opens with emergency number |
| Hospital-specific number | Shift at Colombo General → Emergency | Dials 011-2691111 (hospital emergency) |
| Default emergency number | Shift at unknown location → Emergency | Dials 1990 (national ambulance) |
| SMS notification | Trigger emergency | SMS sent to emergency contact |
| Shift freeze | Trigger emergency | Shift status changed to DISPUTED |
| Admin notification | Trigger emergency | Admin receives incident report |

---

### 5. Push Notifications

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Booking match notification | Customer creates booking | Matched providers receive notification |
| Provider acceptance notification | Provider accepts booking | Customer receives notification |
| Booking start notification | Provider starts shift | Both parties notified |
| Booking complete notification | Provider completes shift | Both parties notified, review requested |
| Payment confirmation notification | Payment successful | Customer notified |
| Notification tap action | Tap notification | App opens to relevant screen |
| Notification in background | App backgrounded → Receive notification | Notification shown, sound played |
| Notification when killed | App killed → Receive notification | Notification shown via FCM |

---

### 6. Document Upload & Verification

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Camera capture | Tap "Upload NIC" → Take photo | Photo captured, preview shown |
| Gallery selection | Tap "Upload NIC" → Select from gallery | Image selected, preview shown |
| File size validation | Select 10MB image | Error: "File too large, max 5MB" |
| File type validation | Select .txt file | Error: "Invalid file type" |
| Upload progress | Confirm upload | Progress indicator shown |
| Upload success | Valid image → Upload | Success message, pending verification |
| Admin approval | Admin approves document | Provider notified, skill verified |
| Admin rejection | Admin rejects document | Provider notified with reason |

---

## Automated Testing

### Unit Tests

```bash
# Run all unit tests
flutter test

# Run specific test file
flutter test test/services/firebase_auth_service_test.dart

# Run with coverage
flutter test --coverage
```

### Integration Tests

```bash
# Run integration tests on connected device
flutter test integration_test/app_test.dart

# Run on specific device
flutter test integration_test/app_test.dart -d <device_id>
```

### Recommended Test Coverage

| Layer | Coverage Target | Priority |
|-------|-----------------|----------|
| Services (Auth, API) | 80%+ | P0 |
| Models/Entities | 90%+ | P0 |
| UI Widgets | 60%+ | P1 |
| Integration Flows | Critical paths | P0 |

---

## Beta Testing (Pre-Launch)

### Internal Testing (Closed)

| Phase | Duration | Participants |
|-------|----------|--------------|
| Alpha | 2 weeks | Development team (5-10 people) |
| Beta | 2 weeks | Company employees + friends (20-50 people) |

### External Testing (Open)

| Platform | Test Type | Duration |
|----------|-----------|----------|
| iOS | TestFlight | 2 weeks (up to 10,000 users) |
| Android | Internal Testing Track | 2 weeks |
| Android | Closed Testing | 2 weeks (up to 2,000 users) |

---

## App Store Pre-Submission Checklist

### iOS App Store

- [ ] App compiles without warnings in Xcode
- [ ] All Info.plist permission justifications are specific
- [ ] Non-clinical disclaimer implemented
- [ ] Location disclosure screen implemented
- [ ] App Tracking Transparency handled (if using analytics)
- [ ] Screenshots for all device sizes (iPhone 6.7", 6.5", 5.5")
- [ ] App Preview video (optional but recommended)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Support URL
- [ ] Demo account credentials for review

### Google Play Store

- [ ] App bundles built for all architectures
- [ ] AndroidManifest.xml permissions justified
- [ ] Location disclosure screen implemented
- [ ] Non-clinical disclaimer implemented
- [ ] Content rating questionnaire completed
- [ ] Screenshots for phone (16:9, 2:1) and tablet
- [ ] Feature graphic (1024x500)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Demo account credentials for review

---

## Testing Schedule (Pre-Launch)

| Week | Activity | Owner |
|------|----------|-------|
| Week 1-2 | Unit & integration testing | Engineering |
| Week 3 | Internal alpha testing | QA Team |
| Week 4 | Beta testing (TestFlight + Play Console) | Selected users |
| Week 5 | Bug fixes & performance optimization | Engineering |
| Week 6 | Final regression testing | QA Team |
| Week 7 | App Store submission preparation | Product |
| Week 8 | App Store review & launch | All |

---

## Test Environment URLs

| Environment | API Base URL | Purpose |
|-------------|--------------|---------|
| Development | `http://localhost:3000` | Local development |
| Staging | `https://api-staging.carelink.lk` | QA testing |
| Production | `https://api.carelink.lk` | Live app |

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| QA Lead | qa@carelink.lk | +94-77-XXX-XXXX |
| Engineering Lead | eng@carelink.lk | +94-77-XXX-XXXX |
| Product Manager | pm@carelink.lk | +94-77-XXX-XXXX |

---

**Document Version:** 1.0
**Last Updated:** 2024
**Next Review:** Pre-launch (2 weeks before submission)
