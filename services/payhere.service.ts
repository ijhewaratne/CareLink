/**
 * PayHere Payment Service
 * Sri Lanka's leading payment gateway integration
 * Supports: Visa, Mastercard, Amex, Frimi, Genie, mCash, EZ Cash
 * 
 * Features:
 * - Escrow payments (hold until service completion)
 * - Platform fee calculation (10%)
 * - Payment status tracking
 * - Refund processing
 */

import crypto from 'crypto';
import axios from 'axios';

// ============================================================================
// Configuration
// ============================================================================

const PAYHERE_CONFIG = {
  // Sandbox URLs (use for development)
  sandbox: {
    checkoutUrl: 'https://sandbox.payhere.lk/pay/checkout',
    apiUrl: 'https://sandbox.payhere.lk/pay/v1',
    merchantId: process.env.PAYHERE_SANDBOX_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_SANDBOX_MERCHANT_SECRET || '',
    appId: process.env.PAYHERE_SANDBOX_APP_ID || '',
    appSecret: process.env.PAYHERE_SANDBOX_APP_SECRET || '',
  },
  // Production URLs
  production: {
    checkoutUrl: 'https://www.payhere.lk/pay/checkout',
    apiUrl: 'https://www.payhere.lk/pay/v1',
    merchantId: process.env.PAYHERE_MERCHANT_ID || '',
    merchantSecret: process.env.PAYHERE_MERCHANT_SECRET || '',
    appId: process.env.PAYHERE_APP_ID || '',
    appSecret: process.env.PAYHERE_APP_SECRET || '',
  },
};

const PLATFORM_FEE_PERCENTAGE = 10; // 10% platform fee

// ============================================================================
// Types
// ============================================================================

export interface PaymentInitiationInput {
  bookingId: string;
  customerEmail: string;
  customerPhone: string;
  customerName: string;
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  customParams?: Record<string, string>;
}

export interface PaymentInitiationResult {
  success: boolean;
  checkoutUrl: string;
  orderId: string;
  hash: string;
  amount: number;
  currency: string;
}

export interface PayHereNotification {
  merchant_id: string;
  order_id: string;
  payment_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  status_message: string;
  method: string;
  card_holder_name?: string;
  card_no?: string;
  card_expiry?: string;
  md5sig: string;
  custom_1?: string;
  custom_2?: string;
}

export interface PaymentVerificationResult {
  valid: boolean;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  method: string;
  message: string;
}

export interface RefundRequest {
  paymentId: string;
  amount: number;
  reason: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  message: string;
}

// ============================================================================
// Payment Initiation
// ============================================================================

/**
 * Initiates a PayHere checkout payment
 * 
 * Flow:
 * 1. Calculate platform fee and total amount
 * 2. Generate MD5 hash for security
 * 3. Return checkout URL for redirect
 * 
 * @param input - Payment initiation details
 * @returns Checkout URL and order details
 */
export async function initiatePayment(
  input: PaymentInitiationInput
): Promise<PaymentInitiationResult> {
  const config = getPayHereConfig();
  
  const {
    bookingId,
    customerEmail,
    customerPhone,
    customerName,
    amount,
    currency = 'LKR',
    description,
    returnUrl,
    cancelUrl,
    notifyUrl,
    customParams = {},
  } = input;

  // Generate unique order ID
  const orderId = `CL-${bookingId}-${Date.now()}`;
  
  // Format amount to 2 decimal places
  const formattedAmount = amount.toFixed(2);
  
  // Generate MD5 hash (PayHere security requirement)
  const hash = generatePayHereHash(
    config.merchantId,
    orderId,
    formattedAmount,
    currency,
    config.merchantSecret
  );

  // Build checkout URL with parameters
  const checkoutParams = new URLSearchParams({
    merchant_id: config.merchantId,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    order_id: orderId,
    items: description,
    amount: formattedAmount,
    currency,
    first_name: customerName.split(' ')[0] || customerName,
    last_name: customerName.split(' ').slice(1).join(' ') || '',
    email: customerEmail,
    phone: customerPhone,
    hash,
    ...Object.entries(customParams).reduce((acc, [key, value]) => ({
      ...acc,
      [`custom_${key}`]: value,
    }), {}),
  });

  const checkoutUrl = `${config.checkoutUrl}?${checkoutParams.toString()}`;

  return {
    success: true,
    checkoutUrl,
    orderId,
    hash,
    amount: parseFloat(formattedAmount),
    currency,
  };
}

// ============================================================================
// Payment Notification Handling
// ============================================================================

/**
 * Verifies PayHere payment notification
 * 
 * Security: Validates MD5 signature to prevent spoofing
 * 
 * @param notification - PayHere webhook notification
 * @returns Verification result with payment status
 */
export function verifyPaymentNotification(
  notification: PayHereNotification
): PaymentVerificationResult {
  const config = getPayHereConfig();
  
  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
  } = notification;

  // Recalculate expected signature
  const expectedSig = generateNotificationHash(
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    config.merchantSecret
  );

  // Validate signature
  if (md5sig.toUpperCase() !== expectedSig.toUpperCase()) {
    return {
      valid: false,
      status: 'FAILED',
      orderId: order_id,
      paymentId: notification.payment_id,
      amount: parseFloat(payhere_amount),
      currency: payhere_currency,
      method: notification.method,
      message: 'Invalid signature - possible spoofing attempt',
    };
  }

  // Map status code to status
  const status = mapStatusCode(status_code);

  return {
    valid: true,
    status,
    orderId: order_id,
    paymentId: notification.payment_id,
    amount: parseFloat(payhere_amount),
    currency: payhere_currency,
    method: notification.method,
    message: notification.status_message,
  };
}

// ============================================================================
// Refund Processing
// ============================================================================

/**
 * Processes a refund through PayHere API
 * 
 * Requires: PayHere App ID and App Secret (different from merchant credentials)
 * 
 * @param refund - Refund request details
 * @returns Refund result
 */
export async function processRefund(refund: RefundRequest): Promise<RefundResult> {
  const config = getPayHereConfig();
  
  try {
    const response = await axios.post(
      `${config.apiUrl}/refund`,
      {
        payment_id: refund.paymentId,
        amount: refund.amount.toFixed(2),
        reason: refund.reason,
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status === 'success') {
      return {
        success: true,
        refundId: response.data.refund_id,
        message: 'Refund processed successfully',
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Refund failed',
      };
    }
  } catch (error) {
    console.error('PayHere refund error:', error);
    return {
      success: false,
      message: 'Refund processing failed',
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculates platform fee and provider payout
 * 
 * @param totalAmount - Total booking amount
 * @returns Fee breakdown
 */
export function calculatePaymentBreakdown(totalAmount: number): {
  totalAmount: number;
  platformFee: number;
  providerPayout: number;
} {
  const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENTAGE / 100) * 100) / 100;
  const providerPayout = totalAmount - platformFee;
  
  return {
    totalAmount,
    platformFee,
    providerPayout,
  };
}

/**
 * Generates PayHere checkout hash
 * 
 * Format: MD5(merchant_id + order_id + amount + currency + md5(merchant_secret))
 */
function generatePayHereHash(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  merchantSecret: string
): string {
  const secretHash = crypto
    .createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();
  
  const hashString = `${merchantId}${orderId}${amount}${currency}${secretHash}`;
  
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}

/**
 * Generates PayHere notification verification hash
 * 
 * Format: MD5(merchant_id + order_id + amount + currency + status_code + md5(merchant_secret))
 */
function generateNotificationHash(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  statusCode: string,
  merchantSecret: string
): string {
  const secretHash = crypto
    .createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();
  
  const hashString = `${merchantId}${orderId}${amount}${currency}${statusCode}${secretHash}`;
  
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}

/**
 * Maps PayHere status codes to internal status
 */
function mapStatusCode(statusCode: string): 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' {
  const statusMap: Record<string, 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED'> = {
    '2': 'SUCCESS',      // Success
    '0': 'PENDING',      // Pending
    '-1': 'CANCELLED',   // Canceled
    '-2': 'FAILED',      // Failed
    '-3': 'FAILED',      // Chargedback
  };
  
  return statusMap[statusCode] || 'FAILED';
}

/**
 * Gets PayHere configuration based on environment
 */
function getPayHereConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? PAYHERE_CONFIG.production : PAYHERE_CONFIG.sandbox;
}

// ============================================================================
// Booking Payment Integration
// ============================================================================

import { PrismaClient, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Creates a payment record for a booking and initiates checkout
 * 
 * @param bookingId - The booking to create payment for
 * @param returnUrl - URL to redirect after payment
 * @param cancelUrl - URL to redirect if payment cancelled
 * @param notifyUrl - Webhook URL for payment notifications
 */
export async function createBookingPayment(
  bookingId: string,
  returnUrl: string,
  cancelUrl: string,
  notifyUrl: string
): Promise<PaymentInitiationResult> {
  // Fetch booking with customer details
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        include: {
          profile: true,
        },
      },
      serviceCategory: true,
    },
  });

  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  if (booking.paymentStatus !== PaymentStatus.PENDING) {
    throw new Error(`Payment already initiated for booking: ${bookingId}`);
  }

  // Calculate payment breakdown
  const breakdown = calculatePaymentBreakdown(Number(booking.totalAmount));

  // Initiate PayHere payment
  const paymentResult = await initiatePayment({
    bookingId: booking.id,
    customerEmail: booking.customer.email || `${booking.customer.phoneNumber}@carelink.placeholder`,
    customerPhone: booking.customer.phoneNumber,
    customerName: booking.customer.profile?.fullName || 'CareLink Customer',
    amount: breakdown.totalAmount,
    currency: booking.currency,
    description: `${booking.serviceCategory.nameEn} - ${booking.careRecipientName || 'Care Recipient'}`,
    returnUrl,
    cancelUrl,
    notifyUrl,
    customParams: {
      booking_id: booking.id,
      platform_fee: breakdown.platformFee.toString(),
      provider_payout: breakdown.providerPayout.toString(),
    },
  });

  // Update booking with payment reference
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: PaymentStatus.PENDING,
      // Store order ID for webhook matching
    },
  });

  return paymentResult;
}

/**
 * Handles PayHere payment notification webhook
 * 
 * @param notification - PayHere webhook payload
 */
export async function handlePaymentNotification(
  notification: PayHereNotification
): Promise<void> {
  const verification = verifyPaymentNotification(notification);
  
  if (!verification.valid) {
    console.error('Invalid payment notification:', verification.message);
    throw new Error('Invalid payment notification signature');
  }

  // Extract booking ID from custom parameter
  const bookingId = notification.custom_1;
  
  if (!bookingId) {
    throw new Error('Booking ID not found in notification custom params');
  }

  // Update booking payment status
  const paymentStatus = mapToPrismaPaymentStatus(verification.status);
  
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus,
    },
  });

  // If payment successful, hold in escrow (update to HELD_IN_ESCROW)
  if (verification.status === 'SUCCESS') {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: PaymentStatus.HELD_IN_ESCROW,
      },
    });

    // TODO: Send notification to provider about confirmed booking
  }

  // Log payment event
  await prisma.auditLog.create({
    data: {
      action: 'PAYMENT_NOTIFICATION',
      entityType: 'Booking',
      entityId: bookingId,
      newValues: JSON.stringify({
        paymentId: verification.paymentId,
        status: verification.status,
        amount: verification.amount,
        method: verification.method,
      }),
      reason: `PayHere payment ${verification.status}: ${verification.message}`,
    },
  });
}

/**
 * Releases escrow payment to provider after service completion
 * 
 * @param bookingId - The completed booking
 */
export async function releaseEscrowPayment(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  if (booking.paymentStatus !== PaymentStatus.HELD_IN_ESCROW) {
    throw new Error(`Cannot release payment. Current status: ${booking.paymentStatus}`);
  }

  // Update status to released
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentStatus: PaymentStatus.RELEASED,
    },
  });

  // TODO: Trigger actual payout to provider (integrate with provider payment method)

  // Log release
  await prisma.auditLog.create({
    data: {
      action: 'PAYMENT_RELEASED',
      entityType: 'Booking',
      entityId: bookingId,
      newValues: JSON.stringify({
        paymentStatus: PaymentStatus.RELEASED,
        releasedAt: new Date().toISOString(),
      }),
    },
  });
}

function mapToPrismaPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case 'SUCCESS':
      return PaymentStatus.HELD_IN_ESCROW;
    case 'FAILED':
      return PaymentStatus.FAILED;
    case 'CANCELLED':
      return PaymentStatus.PENDING; // Allow retry
    default:
      return PaymentStatus.PENDING;
  }
}
