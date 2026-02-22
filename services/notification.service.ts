/**
 * Firebase Cloud Messaging (FCM) Notification Service
 * 
 * Features:
 * - Push notifications for booking events
 * - Topic-based subscriptions (providers, customers)
 * - Multi-device support
 * - Notification analytics tracking
 */

import admin from 'firebase-admin';
import { PrismaClient, NotificationType, UserRole } from '@prisma/client';

// ============================================================================
// Firebase Initialization
// ============================================================================

// Initialize Firebase Admin SDK (run once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const messaging = admin.messaging();
const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
  saveToDatabase?: boolean;
}

export interface SendMulticastInput {
  userIds: string[];
  type: NotificationType;
  payload: NotificationPayload;
}

export interface TopicNotificationInput {
  topic: string;
  type: NotificationType;
  payload: NotificationPayload;
}

// ============================================================================
// FCM Token Management
// ============================================================================

/**
 * Registers or updates a user's FCM token
 * 
 * Called when:
 * - User logs in on a new device
 * - Token is refreshed
 * - App is reinstalled
 * 
 * @param userId - User ID
 * @param fcmToken - FCM device token
 * @param deviceInfo - Device metadata
 */
export async function registerFCMToken(
  userId: string,
  fcmToken: string,
  deviceInfo?: {
    platform?: 'ios' | 'android' | 'web';
    deviceModel?: string;
    appVersion?: string;
  }
): Promise<void> {
  // Check if token already exists
  const existingToken = await prisma.fcmToken.findUnique({
    where: { token: fcmToken },
  });

  if (existingToken) {
    // Update existing token
    await prisma.fcmToken.update({
      where: { token: fcmToken },
      data: {
        userId,
        isActive: true,
        lastUsedAt: new Date(),
        platform: deviceInfo?.platform,
        deviceModel: deviceInfo?.deviceModel,
        appVersion: deviceInfo?.appVersion,
      },
    });
  } else {
    // Create new token
    await prisma.fcmToken.create({
      data: {
        userId,
        token: fcmToken,
        isActive: true,
        platform: deviceInfo?.platform,
        deviceModel: deviceInfo?.deviceModel,
        appVersion: deviceInfo?.appVersion,
      },
    });
  }

  // Subscribe to user-specific topic
  await messaging.subscribeToTopic([fcmToken], `user_${userId}`);
}

/**
 * Deactivates an FCM token (logout, uninstall)
 * 
 * @param fcmToken - Token to deactivate
 */
export async function deactivateFCMToken(fcmToken: string): Promise<void> {
  const token = await prisma.fcmToken.findUnique({
    where: { token: fcmToken },
  });

  if (token) {
    // Unsubscribe from topics
    await messaging.unsubscribeFromTopic([fcmToken], `user_${token.userId}`);

    // Deactivate token
    await prisma.fcmToken.update({
      where: { token: fcmToken },
      data: { isActive: false },
    });
  }
}

/**
 * Gets all active FCM tokens for a user
 * 
 * @param userId - User ID
 * @returns Array of FCM tokens
 */
export async function getUserFCMTokens(userId: string): Promise<string[]> {
  const tokens = await prisma.fcmToken.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: { token: true },
  });

  return tokens.map((t) => t.token);
}

// ============================================================================
// Notification Sending
// ============================================================================

/**
 * Sends a push notification to a specific user
 * 
 * @param input - Notification details
 * @returns Send result
 */
export async function sendNotification(
  input: SendNotificationInput
): Promise<{ success: boolean; sentCount: number; failedCount: number }> {
  const { userId, type, payload, saveToDatabase = true } = input;

  // Get user's FCM tokens
  const tokens = await getUserFCMTokens(userId);

  if (tokens.length === 0) {
    console.warn(`No FCM tokens found for user: ${userId}`);
    return { success: false, sentCount: 0, failedCount: 0 };
  }

  // Build FCM message
  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
    },
    data: {
      type,
      ...payload.data,
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'carelink_notifications',
        sound: 'default',
        priority: 'high',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  // Send multicast
  const response = await messaging.sendEachForMulticast(message);

  // Handle failed tokens
  if (response.failureCount > 0) {
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
        console.error(`FCM send failed for token ${tokens[idx]}:`, resp.error);
      }
    });

    // Deactivate invalid tokens
    await deactivateInvalidTokens(failedTokens);
  }

  // Save to database
  if (saveToDatabase) {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: payload.title,
        body: payload.body,
        data: payload.data ? JSON.stringify(payload.data) : null,
        sentAt: new Date(),
        isRead: false,
      },
    });
  }

  return {
    success: response.successCount > 0,
    sentCount: response.successCount,
    failedCount: response.failureCount,
  };
}

/**
 * Sends notifications to multiple users
 * 
 * @param input - Multicast notification details
 */
export async function sendMulticastNotification(
  input: SendMulticastInput
): Promise<{ success: boolean; totalSent: number }> {
  const { userIds, type, payload } = input;

  let totalSent = 0;

  // Send to each user (could be optimized with topic-based approach)
  for (const userId of userIds) {
    const result = await sendNotification({
      userId,
      type,
      payload,
    });
    totalSent += result.sentCount;
  }

  return {
    success: totalSent > 0,
    totalSent,
  };
}

/**
 * Sends notification to a topic
 * 
 * Topics:
 * - all_providers
 * - all_customers
 * - user_{userId}
 * - district_{districtName}
 * 
 * @param input - Topic notification details
 */
export async function sendTopicNotification(
  input: TopicNotificationInput
): Promise<{ success: boolean; messageId: string }> {
  const { topic, type, payload } = input;

  const message: admin.messaging.Message = {
    topic,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
    },
    data: {
      type,
      ...payload.data,
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'carelink_notifications',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };

  const messageId = await messaging.send(message);

  return {
    success: true,
    messageId,
  };
}

// ============================================================================
// Booking Event Notifications
// ============================================================================

/**
 * Notifies providers about a new booking match
 * 
 * @param providerIds - Matched provider IDs
 * @param bookingId - The new booking
 */
export async function notifyProvidersOfNewBooking(
  providerIds: string[],
  bookingId: string
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      serviceCategory: true,
      locationGeo: false,
    },
  });

  if (!booking) return;

  const payload: NotificationPayload = {
    title: 'New Booking Available!',
    body: `A new ${booking.serviceCategory.nameEn} booking is available near you. Tap to view details.`,
    data: {
      bookingId: booking.id,
      type: 'NEW_BOOKING',
      scheduledDate: booking.scheduledDate.toISOString(),
      location: booking.locationAddress,
    },
  };

  await sendMulticastNotification({
    userIds: providerIds,
    type: NotificationType.BOOKING_MATCHED,
    payload,
  });
}

/**
 * Notifies customer when a provider accepts their booking
 * 
 * @param bookingId - The accepted booking
 * @param providerId - The accepting provider
 */
export async function notifyCustomerOfProviderAcceptance(
  bookingId: string,
  providerId: string
): Promise<void> {
  const [booking, provider] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId } }),
    prisma.user.findUnique({
      where: { id: providerId },
      include: { profile: true },
    }),
  ]);

  if (!booking || !provider) return;

  const payload: NotificationPayload = {
    title: 'Provider Found!',
    body: `${provider.profile?.fullName || 'A care companion'} has accepted your booking request.`,
    data: {
      bookingId: booking.id,
      type: 'PROVIDER_ACCEPTED',
      providerName: provider.profile?.fullName || '',
      providerId: provider.id,
    },
  };

  await sendNotification({
    userId: booking.customerId,
    type: NotificationType.BOOKING_CONFIRMED,
    payload,
  });
}

/**
 * Notifies both parties when booking starts
 * 
 * @param bookingId - The started booking
 */
export async function notifyBookingStarted(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { include: { profile: true } },
      provider: { include: { profile: true } },
    },
  });

  if (!booking || !booking.provider) return;

  // Notify customer
  await sendNotification({
    userId: booking.customerId,
    type: NotificationType.BOOKING_STARTED,
    payload: {
      title: 'Care Service Started',
      body: `${booking.provider.profile?.fullName || 'Your care companion'} has started the service.`,
      data: {
        bookingId: booking.id,
        type: 'BOOKING_STARTED',
      },
    },
  });

  // Notify provider
  await sendNotification({
    userId: booking.provider.id,
    type: NotificationType.BOOKING_STARTED,
    payload: {
      title: 'Service Started',
      body: `You've started the care service for ${booking.careRecipientName || 'the care recipient'}.`,
      data: {
        bookingId: booking.id,
        type: 'BOOKING_STARTED',
      },
    },
  });
}

/**
 * Notifies both parties when booking completes
 * 
 * @param bookingId - The completed booking
 */
export async function notifyBookingCompleted(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { include: { profile: true } },
      provider: { include: { profile: true } },
    },
  });

  if (!booking || !booking.provider) return;

  // Notify customer
  await sendNotification({
    userId: booking.customerId,
    type: NotificationType.BOOKING_COMPLETED,
    payload: {
      title: 'Care Service Completed',
      body: `Your care service has been completed. Please rate your experience.`,
      data: {
        bookingId: booking.id,
        type: 'BOOKING_COMPLETED',
        requestReview: 'true',
      },
    },
  });

  // Notify provider
  await sendNotification({
    userId: booking.provider.id,
    type: NotificationType.BOOKING_COMPLETED,
    payload: {
      title: 'Service Completed',
      body: `The care service has been completed. Payment will be released to your account.`,
      data: {
        bookingId: booking.id,
        type: 'BOOKING_COMPLETED',
      },
    },
  });
}

/**
 * Sends payment confirmation notification
 * 
 * @param bookingId - The paid booking
 */
export async function notifyPaymentConfirmed(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) return;

  await sendNotification({
    userId: booking.customerId,
    type: NotificationType.PAYMENT_RECEIVED,
    payload: {
      title: 'Payment Confirmed',
      body: `Your payment of LKR ${booking.totalAmount} has been received. We're finding a care companion for you.`,
      data: {
        bookingId: booking.id,
        type: 'PAYMENT_CONFIRMED',
        amount: booking.totalAmount.toString(),
      },
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deactivates FCM tokens that returned errors
 * 
 * @param tokens - Failed tokens
 */
async function deactivateInvalidTokens(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    await prisma.fcmToken.updateMany({
      where: { token },
      data: { isActive: false },
    });
  }
}

/**
 * Gets unread notification count for a user
 * 
 * @param userId - User ID
 * @returns Unread count
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

/**
 * Marks notifications as read
 * 
 * @param notificationIds - IDs to mark as read
 */
export async function markNotificationsAsRead(
  notificationIds: string[]
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Gets paginated notifications for a user
 * 
 * @param userId - User ID
 * @param page - Page number
 * @param limit - Items per page
 */
export async function getUserNotifications(
  userId: string,
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
