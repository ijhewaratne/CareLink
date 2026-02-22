import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

/// =============================================================================
/// FIREBASE AUTHENTICATION SERVICE
/// =============================================================================
/// 
/// Handles phone number authentication using Firebase Auth.
/// 
/// Features:
/// - Phone number normalization (Sri Lanka: +94)
/// - Invisible reCAPTCHA verification (anti-fraud)
/// - OTP verification
/// - Backend token handshake
/// 
/// Security:
/// - reCAPTCHA prevents SMS pumping attacks
/// - Phone numbers normalized to E.164 format
/// - Firebase JWT tokens verified by backend
/// =============================================================================

class FirebaseAuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  
  /// Verification ID stored during phone verification
  String? _verificationId;
  
  /// Force resending token
  int? _resendToken;

  /// Backend API base URL
  final String _apiBaseUrl;

  FirebaseAuthService({required String apiBaseUrl}) : _apiBaseUrl = apiBaseUrl;

  /// ===========================================================================
  /// PHONE NUMBER NORMALIZATION
  /// ===========================================================================
  /// 
  /// Converts various phone number formats to E.164 standard.
  /// 
  /// Sri Lanka format:
  /// - Input: 0771234567, 771234567, +94771234567
  /// - Output: +94771234567
  /// 
  /// @param phoneNumber Raw phone number input
  /// @returns Normalized E.164 phone number
  String normalizePhoneNumber(String phoneNumber) {
    // Remove all non-digit characters
    String digitsOnly = phoneNumber.replaceAll(RegExp(r'\D'), '');
    
    // Remove leading zero if present
    if (digitsOnly.startsWith('0')) {
      digitsOnly = digitsOnly.substring(1);
    }
    
    // Add Sri Lanka country code if not present
    if (!digitsOnly.startsWith('94')) {
      digitsOnly = '94$digitsOnly';
    }
    
    // Return E.164 format
    return '+$digitsOnly';
  }

  /// ===========================================================================
  /// SEND OTP
  /// ===========================================================================
  /// 
  /// Sends OTP to the provided phone number.
  /// 
  /// Flow:
  /// 1. Normalize phone number
  /// 2. Configure reCAPTCHA verifier (invisible)
  /// 3. Call Firebase verifyPhoneNumber
  /// 4. Store verification ID for OTP verification
  /// 
  /// @param phoneNumber Raw phone number
  /// @param onCodeSent Callback when OTP is sent
  /// @param onError Callback on error
  Future<void> sendOTP({
    required String phoneNumber,
    required VoidCallback onCodeSent,
    required Function(String error) onError,
  }) async {
    try {
      // Normalize phone number
      final normalizedPhone = normalizePhoneNumber(phoneNumber);
      
      debugPrint('Sending OTP to: $normalizedPhone');

      await _auth.verifyPhoneNumber(
        phoneNumber: normalizedPhone,
        
        // =====================================================================
        // VERIFICATION COMPLETED (Auto-retrieval or instant verification)
        // =====================================================================
        verificationCompleted: (PhoneAuthCredential credential) async {
          debugPrint('Auto-verification completed');
          // Auto-sign in (rare on iOS, common on Android with Google Play Services)
          await _auth.signInWithCredential(credential);
        },
        
        // =====================================================================
        // VERIFICATION FAILED
        // =====================================================================
        verificationFailed: (FirebaseAuthException e) {
          debugPrint('Verification failed: ${e.code} - ${e.message}');
          String errorMessage = 'Verification failed. Please try again.';
          
          switch (e.code) {
            case 'invalid-phone-number':
              errorMessage = 'Invalid phone number format.';
              break;
            case 'too-many-requests':
              errorMessage = 'Too many attempts. Please try again later.';
              break;
            case 'quota-exceeded':
              errorMessage = 'SMS quota exceeded. Please contact support.';
              break;
            case 'app-not-authorized':
              errorMessage = 'App not authorized for phone authentication.';
              break;
            case 'captcha-check-failed':
              errorMessage = 'Security check failed. Please try again.';
              break;
          }
          
          onError(errorMessage);
        },
        
        // =====================================================================
        // CODE SENT
        // =====================================================================
        codeSent: (String verificationId, int? resendToken) {
          debugPrint('OTP sent successfully');
          _verificationId = verificationId;
          _resendToken = resendToken;
          onCodeSent();
        },
        
        // =====================================================================
        // AUTO-RETRIEVAL TIMEOUT
        // =====================================================================
        codeAutoRetrievalTimeout: (String verificationId) {
          debugPrint('Auto-retrieval timeout');
          _verificationId = verificationId;
        },
        
        // =====================================================================
        // TIMEOUT DURATION
        // =====================================================================
        timeout: const Duration(seconds: 60),
        
        // =====================================================================
        // FORCE RESENDING TOKEN
        // =====================================================================
        forceResendingToken: _resendToken,
      );
    } catch (e) {
      debugPrint('Error sending OTP: $e');
      onError('Failed to send OTP. Please try again.');
    }
  }

  /// ===========================================================================
  /// VERIFY OTP
  /// ===========================================================================
  /// 
  /// Verifies the OTP entered by user.
  /// 
  /// Flow:
  /// 1. Create credential from verification ID + OTP
  /// 2. Sign in with Firebase
  /// 3. Get Firebase ID token
  /// 4. Send to backend for verification and user creation/retrieval
  /// 
  /// @param otp 6-digit OTP code
  /// @returns AuthResult with user data and backend tokens
  Future<AuthResult> verifyOTP(String otp) async {
    try {
      if (_verificationId == null) {
        throw Exception('Verification ID not found. Please request OTP again.');
      }

      // Create credential
      final credential = PhoneAuthProvider.credential(
        verificationId: _verificationId!,
        smsCode: otp,
      );

      // Sign in with Firebase
      final userCredential = await _auth.signInWithCredential(credential);
      final firebaseUser = userCredential.user;

      if (firebaseUser == null) {
        throw Exception('Firebase authentication failed');
      }

      debugPrint('Firebase auth successful: ${firebaseUser.uid}');

      // Get Firebase ID token
      final idToken = await firebaseUser.getIdToken();
      
      // Backend handshake
      final backendResult = await _backendHandshake(
        firebaseUid: firebaseUser.uid,
        idToken: idToken,
        phoneNumber: firebaseUser.phoneNumber ?? '',
      );

      return AuthResult(
        success: true,
        user: backendResult.user,
        accessToken: backendResult.accessToken,
        refreshToken: backendResult.refreshToken,
        isNewUser: backendResult.isNewUser,
      );

    } on FirebaseAuthException catch (e) {
      debugPrint('OTP verification failed: ${e.code} - ${e.message}');
      String errorMessage = 'Invalid OTP. Please try again.';
      
      switch (e.code) {
        case 'invalid-verification-code':
          errorMessage = 'Invalid OTP code. Please check and try again.';
          break;
        case 'invalid-verification-id':
          errorMessage = 'Session expired. Please request OTP again.';
          break;
        case 'session-expired':
          errorMessage = 'OTP expired. Please request a new one.';
          break;
      }
      
      return AuthResult(
        success: false,
        errorMessage: errorMessage,
      );
    } catch (e) {
      debugPrint('Error verifying OTP: $e');
      return AuthResult(
        success: false,
        errorMessage: 'Failed to verify OTP. Please try again.',
      );
    }
  }

  /// ===========================================================================
  /// BACKEND HANDSHAKE
  /// ===========================================================================
  /// 
  /// Sends Firebase token to backend to:
  /// 1. Verify Firebase JWT
  /// 2. Create new user if not exists
  /// 3. Return existing user data
  /// 4. Issue backend access/refresh tokens
  /// 
  /// Endpoint: POST /api/v1/auth/verify
  Future<BackendAuthResult> _backendHandshake({
    required String firebaseUid,
    required String idToken,
    required String phoneNumber,
  }) async {
    final response = await http.post(
      Uri.parse('$_apiBaseUrl/api/v1/auth/verify'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $idToken',
      },
      body: jsonEncode({
        'firebaseUid': firebaseUid,
        'phoneNumber': phoneNumber,
      }),
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = jsonDecode(response.body);
      return BackendAuthResult(
        user: UserData.fromJson(data['data']['user']),
        accessToken: data['data']['accessToken'],
        refreshToken: data['data']['refreshToken'],
        isNewUser: response.statusCode == 201,
      );
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['error']['message'] ?? 'Backend authentication failed');
    }
  }

  /// ===========================================================================
  /// RESEND OTP
  /// ===========================================================================
  Future<void> resendOTP({
    required String phoneNumber,
    required VoidCallback onCodeSent,
    required Function(String error) onError,
  }) async {
    // Reset verification ID to force new code
    _verificationId = null;
    
    await sendOTP(
      phoneNumber: phoneNumber,
      onCodeSent: onCodeSent,
      onError: onError,
    );
  }

  /// ===========================================================================
  /// SIGN OUT
  /// ===========================================================================
  Future<void> signOut() async {
    await _auth.signOut();
    _verificationId = null;
    _resendToken = null;
  }

  /// ===========================================================================
  /// GET CURRENT USER
  /// ===========================================================================
  User? get currentUser => _auth.currentUser;

  /// ===========================================================================
  /// AUTH STATE STREAM
  /// ===========================================================================
  Stream<User?> get authStateChanges => _auth.authStateChanges();
}

/// =============================================================================
/// AUTH RESULT MODELS
/// =============================================================================

class AuthResult {
  final bool success;
  final UserData? user;
  final String? accessToken;
  final String? refreshToken;
  final bool? isNewUser;
  final String? errorMessage;

  AuthResult({
    required this.success,
    this.user,
    this.accessToken,
    this.refreshToken,
    this.isNewUser,
    this.errorMessage,
  });
}

class BackendAuthResult {
  final UserData user;
  final String accessToken;
  final String refreshToken;
  final bool isNewUser;

  BackendAuthResult({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.isNewUser,
  });
}

class UserData {
  final String id;
  final String phoneNumber;
  final String role;
  final String? email;
  final bool hasAcceptedServiceScope;
  final ProfileData? profile;

  UserData({
    required this.id,
    required this.phoneNumber,
    required this.role,
    this.email,
    required this.hasAcceptedServiceScope,
    this.profile,
  });

  factory UserData.fromJson(Map<String, dynamic> json) {
    return UserData(
      id: json['id'],
      phoneNumber: json['phoneNumber'],
      role: json['role'],
      email: json['email'],
      hasAcceptedServiceScope: json['hasAcceptedServiceScope'] ?? false,
      profile: json['profile'] != null 
          ? ProfileData.fromJson(json['profile']) 
          : null,
    );
  }
}

class ProfileData {
  final String fullName;
  final String? address;
  final String? city;
  final String? district;

  ProfileData({
    required this.fullName,
    this.address,
    this.city,
    this.district,
  });

  factory ProfileData.fromJson(Map<String, dynamic> json) {
    return ProfileData(
      fullName: json['fullName'],
      address: json['address'],
      city: json['city'],
      district: json['district'],
    );
  }
}

/// =============================================================================
/// BACKEND AUTH CONTROLLER (Node.js/Express)
/// =============================================================================
/// 
/// This is the corresponding backend controller that verifies Firebase tokens
/// and creates/returns user records.
/// 
/// ```typescript
/// // controllers/auth.controller.ts
/// import { Request, Response } from 'express';
/// import admin from 'firebase-admin';
/// import { PrismaClient } from '@prisma/client';
/// import jwt from 'jsonwebtoken';
/// 
/// const prisma = new PrismaClient();
/// 
/// export async function verifyFirebaseToken(req: Request, res: Response) {
///   try {
///     const authHeader = req.headers.authorization;
///     if (!authHeader?.startsWith('Bearer ')) {
///       return res.status(401).json({ error: 'No token provided' });
///     }
/// 
///     const idToken = authHeader.split('Bearer ')[1];
///     
///     // Verify Firebase token
///     const decodedToken = await admin.auth().verifyIdToken(idToken);
///     const firebaseUid = decodedToken.uid;
///     const phoneNumber = decodedToken.phone_number;
/// 
///     // Find or create user
///     let user = await prisma.user.findUnique({
///       where: { firebaseUid },
///       include: { profile: true },
///     });
/// 
///     const isNewUser = !user;
/// 
///     if (!user) {
///       // Create new user
///       user = await prisma.user.create({
///         data: {
///           firebaseUid,
///           phoneNumber: phoneNumber || req.body.phoneNumber,
///           role: 'CUSTOMER',
///           phoneVerified: true,
///         },
///         include: { profile: true },
///       });
///     }
/// 
///     // Generate backend tokens
///     const accessToken = jwt.sign(
///       { userId: user.id, role: user.role },
///       process.env.JWT_SECRET!,
///       { expiresIn: '1h' }
///     );
/// 
///     const refreshToken = jwt.sign(
///       { userId: user.id },
///       process.env.JWT_REFRESH_SECRET!,
///       { expiresIn: '7d' }
///     );
/// 
///     return res.status(isNewUser ? 201 : 200).json({
///       success: true,
///       data: {
///         user: {
///           id: user.id,
///           phoneNumber: user.phoneNumber,
///           role: user.role,
///           hasAcceptedServiceScope: user.hasAcceptedServiceScope,
///           profile: user.profile,
///         },
///         accessToken,
///         refreshToken,
///       },
///     });
///   } catch (error) {
///     console.error('Auth verification error:', error);
///     return res.status(401).json({
///       error: {
///         code: 'AUTH_FAILED',
///         message: 'Authentication failed',
///       },
///     });
///   }
/// }
/// ```
