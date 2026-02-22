/**
 * Emergency Escalation Service
 * Handles emergency button presses during active shifts
 * CRITICAL: This is NOT a medical emergency service - it facilitates contacting
 * native emergency services and notifies emergency contacts
 */

import { PrismaClient, BookingStatus } from '@prisma/client';
import { sendSMS } from '../utils/sms.service';

const prisma = new PrismaClient();

// ============================================================================
// Configuration
// ============================================================================

/** Sri Lanka National Emergency Ambulance Number */
const DEFAULT_EMERGENCY_NUMBER = '1990';

/** SMS Sender ID for emergency notifications */
const SMS_SENDER_ID = 'CareLink';

// ============================================================================
// Types
// ============================================================================

export interface EmergencyEscalationInput {
  shiftId: string;
  triggeredBy: 'CUSTOMER' | 'PROVIDER';
  triggeredByUserId: string;
  reason?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export interface EmergencyEscalationResult {
  success: boolean;
  emergencyNumber: string;
  shiftFrozen: boolean;
  smsSent: boolean;
  incidentReported: boolean;
}

export interface ShiftWithDetails {
  id: string;
  status: BookingStatus;
  incidentReported: boolean;
  locationAddress: string;
  locationCity: string;
  careRecipientName: string;
  customer: {
    id: string;
    phoneNumber: string;
    profile: {
      fullName: string;
      emergencyName: string | null;
      emergencyPhone: string | null;
    } | null;
  };
  provider: {
    id: string;
    phoneNumber: string;
    profile: {
      fullName: string;
    } | null;
  } | null;
  serviceCategory: {
    nameEn: string;
  };
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Escalates an emergency during an active shift
 * 
 * EMERGENCY PROTOCOL:
 * 1. Mark shift with incident_reported = true
 * 2. Determine appropriate emergency number (hospital-specific or default 1990)
 * 3. Send SMS to customer's emergency contact
 * 4. Freeze shift for admin review
 * 
 * IMPORTANT: This does NOT provide medical assistance. It only:
 * - Facilitates calling native emergency services
 * - Notifies emergency contacts
 * - Logs the incident for admin review
 * 
 * @param input - Emergency escalation request
 * @returns Result with emergency number and notification status
 */
export async function escalateEmergency(
  input: EmergencyEscalationInput
): Promise<EmergencyEscalationResult> {
  const { shiftId, triggeredBy, triggeredByUserId, reason, location } = input;

  try {
    // ========================================================================
    // Step 1: Fetch shift with all related details
    // ========================================================================
    const shift = await prisma.booking.findUnique({
      where: { id: shiftId },
      include: {
        customer: {
          select: {
            id: true,
            phoneNumber: true,
            profile: {
              select: {
                fullName: true,
                emergencyName: true,
                emergencyPhone: true,
              },
            },
          },
        },
        provider: {
          select: {
            id: true,
            phoneNumber: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
        serviceCategory: {
          select: {
            nameEn: true,
          },
        },
      },
    }) as ShiftWithDetails | null;

    if (!shift) {
      throw new Error(`Shift not found: ${shiftId}`);
    }

    // Validate shift is in an active state
    if (![BookingStatus.IN_PROGRESS, BookingStatus.MATCHED, BookingStatus.CONFIRMED].includes(shift.status)) {
      throw new Error(`Cannot escalate emergency for shift in status: ${shift.status}`);
    }

    // ========================================================================
    // Step 2: Mark incident as reported (freeze shift)
    // ========================================================================
    await prisma.booking.update({
      where: { id: shiftId },
      data: {
        // We'll add an incidentReported field via migration
        // For now, we update the status to indicate admin review needed
        status: BookingStatus.DISPUTED,
        cancellationReason: `EMERGENCY_ESCALATION: Triggered by ${triggeredBy}. Reason: ${reason || 'Not specified'}`,
      },
    });

    // ========================================================================
    // Step 3: Determine emergency number
    // ========================================================================
    const emergencyNumber = await determineEmergencyNumber(shift);

    // ========================================================================
    // Step 4: Send SMS to emergency contact
    // ========================================================================
    let smsSent = false;
    if (shift.customer.profile?.emergencyPhone) {
      smsSent = await sendEmergencySMS(shift, triggeredBy, emergencyNumber);
    }

    // ========================================================================
    // Step 5: Log audit event
    // ========================================================================
    await prisma.auditLog.create({
      data: {
        userId: triggeredByUserId,
        action: 'EMERGENCY_ESCALATION',
        entityType: 'Booking',
        entityId: shiftId,
        oldValues: JSON.stringify({ status: shift.status }),
        newValues: JSON.stringify({ 
          status: BookingStatus.DISPUTED,
          incidentReported: true,
          triggeredBy,
          emergencyNumber,
          smsSent,
        }),
        reason: reason || 'Emergency button pressed',
      },
    });

    return {
      success: true,
      emergencyNumber,
      shiftFrozen: true,
      smsSent,
      incidentReported: true,
    };

  } catch (error) {
    console.error('Emergency escalation error:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determines the appropriate emergency number to call
 * 
 * Logic:
 * - If location contains known hospital name, return hospital emergency desk
 * - Otherwise, return national emergency ambulance number (1990)
 * 
 * @param shift - The booking/shift details
 * @returns Emergency phone number
 */
async function determineEmergencyNumber(shift: ShiftWithDetails): Promise<string> {
  // Check if location address contains known hospital patterns
  const locationUpper = shift.locationAddress.toUpperCase();
  
  // Known hospital emergency numbers (example mapping)
  // In production, this would query a hospitals table
  const hospitalEmergencyNumbers: Record<string, string> = {
    'COLOMBO GENERAL HOSPITAL': '011-2691111',
    'NATIONAL HOSPITAL': '011-2691111',
    'ASIRI HOSPITAL': '011-4665500',
    'NAWALOKA HOSPITAL': '011-5777777',
    'DURDANS HOSPITAL': '011-2140000',
    'LANKA HOSPITALS': '011-5530000',
  };

  // Check for hospital match
  for (const [hospital, number] of Object.entries(hospitalEmergencyNumbers)) {
    if (locationUpper.includes(hospital)) {
      return number;
    }
  }

  // Default to national emergency ambulance
  return DEFAULT_EMERGENCY_NUMBER;
}

/**
 * Sends emergency notification SMS to customer's emergency contact
 * 
 * @param shift - Shift details
 * @param triggeredBy - Who triggered the emergency
 * @param emergencyNumber - The number to call
 * @returns Whether SMS was sent successfully
 */
async function sendEmergencySMS(
  shift: ShiftWithDetails,
  triggeredBy: string,
  emergencyNumber: string
): Promise<boolean> {
  const emergencyContact = shift.customer.profile?.emergencyPhone;
  if (!emergencyContact) {
    return false;
  }

  const customerName = shift.customer.profile?.fullName || 'A CareLink customer';
  const careRecipientName = shift.careRecipientName || 'care recipient';
  const triggeredByText = triggeredBy === 'CUSTOMER' ? 'the customer' : 'the care companion';

  const message = `CareLink EMERGENCY ALERT: ${customerName} has triggered an emergency for ${careRecipientName} at ${shift.locationAddress}. Emergency services contacted: ${emergencyNumber}. This was triggered by ${triggeredByText}. Please check immediately. - CareLink`;

  try {
    await sendSMS({
      to: emergencyContact,
      message,
      senderId: SMS_SENDER_ID,
    });
    return true;
  } catch (error) {
    console.error('Failed to send emergency SMS:', error);
    return false;
  }
}

// ============================================================================
// Additional Functions
// ============================================================================

/**
 * Gets emergency contact information for a customer
 * Used by Flutter app to display emergency contact details
 */
export async function getEmergencyContactInfo(customerId: string): Promise<{
  hasEmergencyContact: boolean;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
}> {
  const profile = await prisma.profile.findUnique({
    where: { userId: customerId },
    select: {
      emergencyName: true,
      emergencyPhone: true,
      emergencyRelation: true,
    },
  });

  return {
    hasEmergencyContact: !!profile?.emergencyPhone,
    emergencyName: profile?.emergencyName || undefined,
    emergencyPhone: profile?.emergencyPhone || undefined,
    emergencyRelation: profile?.emergencyRelation || undefined,
  };
}

/**
 * Updates emergency contact information
 */
export async function updateEmergencyContact(
  customerId: string,
  emergencyData: {
    emergencyName: string;
    emergencyPhone: string;
    emergencyRelation: string;
  }
): Promise<void> {
  await prisma.profile.update({
    where: { userId: customerId },
    data: {
      emergencyName: emergencyData.emergencyName,
      emergencyPhone: emergencyData.emergencyPhone,
      emergencyRelation: emergencyData.emergencyRelation,
    },
  });
}
