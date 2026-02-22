import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// =============================================================================
/// LOCATION DISCLOSURE SCREEN
/// =============================================================================
/// 
/// CRITICAL: This screen MUST be shown BEFORE requesting location permissions.
/// Google Play will suspend the app if this disclosure is skipped.
/// 
/// Requirements:
/// - Full-screen UI with clear explanation
/// - Must include Google's required phrasing for background tracking
/// - "I Understand" button triggers native permission prompt
/// - "Deny" option must be available
/// 
/// Reference: Google Play Location Permissions Policy
/// https://support.google.com/googleplay/android-developer/answer/9799150
/// =============================================================================

class LocationDisclosureScreen extends StatefulWidget {
  final bool isProviderApp;
  final VoidCallback onGranted;
  final VoidCallback onDenied;

  const LocationDisclosureScreen({
    Key? key,
    required this.isProviderApp,
    required this.onGranted,
    required this.onDenied,
  }) : super(key: key);

  @override
  State<LocationDisclosureScreen> createState() => _LocationDisclosureScreenState();
}

class _LocationDisclosureScreenState extends State<LocationDisclosureScreen> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Spacer(flex: 1),

              // =========================================================================
              // ILLUSTRATION: Location pin / map icon
              // =========================================================================
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: Theme.of(context).primaryColor.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.location_on,
                  size: 60,
                  color: Theme.of(context).primaryColor,
                ),
              ),

              const SizedBox(height: 32),

              // =========================================================================
              // HEADLINE
              // =========================================================================
              Text(
                'How CareLink Uses Your Location',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 24),

              // =========================================================================
              // BODY COPY - Provider App
              // =========================================================================
              if (widget.isProviderApp) ...[
                _buildInfoCard(
                  icon: Icons.security,
                  title: 'Safety First',
                  description:
                      'To keep Care Recipients safe, CareLink tracks your location to verify your arrival at the hospital and share your live ETA with the family.',
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.orange.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.warning_amber_rounded,
                            color: Colors.orange.shade800,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Important Notice',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.orange.shade800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        // =========================================================================
                        // GOOGLE REQUIRED PHRASING - DO NOT MODIFY
                        // =========================================================================
                        'CareLink collects location data to enable shift-tracking and navigation even when the app is closed or not in use.',
                        style: TextStyle(
                          color: Colors.orange.shade900,
                          fontSize: 14,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ]

              // =========================================================================
              // BODY COPY - Customer App
              // =========================================================================
              else ...[
                _buildInfoCard(
                  icon: Icons.people,
                  title: 'Find Nearby Care Companions',
                  description:
                      'CareLink uses your location to match you with verified Care Companions in your area and show accurate arrival times.',
                ),
                const SizedBox(height: 16),
                _buildInfoCard(
                  icon: Icons.navigation,
                  title: 'Track Arrival',
                  description:
                      'You can track your Care Companion\'s journey to the hospital in real-time.',
                ),
              ],

              const Spacer(flex: 2),

              // =========================================================================
              // ACTION BUTTONS
              // =========================================================================
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _requestPermission,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Theme.of(context).primaryColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'I Understand',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 16),

              // =========================================================================
              // DENY OPTION
              // =========================================================================
              TextButton(
                onPressed: widget.onDenied,
                child: Text(
                  'Deny',
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 14,
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // =========================================================================
              // PRIVACY NOTE
              // =========================================================================
              Text(
                'Your location data is encrypted and only shared during active shifts.',
                style: TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 12,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInfoCard({
    required IconData icon,
    required String title,
    required String description,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Theme.of(context).primaryColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            icon,
            color: Theme.of(context).primaryColor,
            size: 24,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                description,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade700,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// ===========================================================================
  /// REQUEST LOCATION PERMISSION
  /// ===========================================================================
  Future<void> _requestPermission() async {
    setState(() => _isLoading = true);

    try {
      // For provider app, request background location
      // For customer app, request when-in-use location
      final permission = widget.isProviderApp
          ? Permission.locationAlways
          : Permission.locationWhenInUse;

      final status = await permission.request();

      if (mounted) {
        setState(() => _isLoading = false);

        if (status.isGranted) {
          widget.onGranted();
        } else if (status.isDenied) {
          // User denied - show explanation and try again
          _showPermissionDeniedDialog();
        } else if (status.isPermanentlyDenied) {
          // User permanently denied - open app settings
          _showSettingsDialog();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        _showErrorDialog('Failed to request permission: $e');
      }
    }
  }

  void _showPermissionDeniedDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Location Required'),
        content: Text(
          widget.isProviderApp
              ? 'Background location is required to track your shift and share your ETA with the care recipient\'s family.'
              : 'Location access is required to find nearby Care Companions.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _requestPermission();
            },
            child: const Text('Try Again'),
          ),
        ],
      ),
    );
  }

  void _showSettingsDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permission Required'),
        content: const Text(
          'Location permission has been permanently denied. Please enable it in your device settings to use CareLink.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              openAppSettings();
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Error'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

/// =============================================================================
/// USAGE EXAMPLE
/// =============================================================================
/// 
/// In your app's onboarding flow:
/// 
/// ```dart
/// Navigator.of(context).push(
///   MaterialPageRoute(
///     builder: (context) => LocationDisclosureScreen(
///       isProviderApp: true, // or false for customer app
///       onGranted: () {
///         // Permission granted - proceed to next screen
///         Navigator.of(context).pushReplacement(
///           MaterialPageRoute(builder: (context) => HomeScreen()),
///         );
///       },
///       onDenied: () {
///         // Permission denied - show limited functionality screen
///         Navigator.of(context).pushReplacement(
///           MaterialPageRoute(builder: (context) => LimitedFunctionalityScreen()),
///         );
///       },
///     ),
///   ),
/// );
/// ```
