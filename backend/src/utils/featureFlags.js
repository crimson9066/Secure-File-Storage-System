/**
 * Feature Flags - Gradual Rollout System
 * 
 * Allows enabling/disabling features without code changes.
 * Useful for beta testing, gradual rollout, A/B testing.
 * 
 * Features can be:
 * - Always off (ready but not enabled)
 * - In beta (enabled for beta users)
 * - Percentage rollout (enable for X% of users)
 * - Always on (fully enabled)
 * 
 * Usage:
 *   if (featureFlags.isEnabled('chunkedUpload', req.user)) {
 *     // Use chunked upload
 *   }
 */

class FeatureFlagEngine {
  constructor() {
    // Define feature flags with their current state
    this.flags = {
      chunkedUpload: {
        enabled: process.env.FEATURE_CHUNKED_UPLOAD === 'true',
        rolloutPercent: 100,
        betaUsersOnly: false,
        reason: 'Enable for large files > 100MB'
      },
      fileVersioning: {
        enabled: process.env.FEATURE_VERSIONING === 'true',
        rolloutPercent: 0,
        betaUsersOnly: false,
        reason: 'Not fully implemented yet - track file changes over time'
      },
      endToEndMetadataEncryption: {
        enabled: process.env.FEATURE_METADATA_ENCRYPTION === 'true',
        rolloutPercent: 50,
        betaUsersOnly: true,
        reason: 'Encrypt filenames too (adds complexity)'
      },
      webSocketProgress: {
        enabled: process.env.FEATURE_WEBSOCKET === 'true',
        rolloutPercent: 25,
        betaUsersOnly: false,
        reason: 'Real-time upload progress'
      },
      collaborativeSharing: {
        enabled: false,
        rolloutPercent: 0,
        betaUsersOnly: false,
        reason: 'Multiple users can edit same file - needs conflict resolution'
      }
    };
  }

  isEnabled(featureName, user = null) {
    const flag = this.flags[featureName];
    if (!flag) {
      console.warn(`Unknown feature flag: ${featureName}`);
      return false;
    }

    // Not enabled globally
    if (!flag.enabled) {
      return false;
    }

    // Beta users only
    if (flag.betaUsersOnly && (!user || !user.betaTester)) {
      return false;
    }

    // Percentage-based rollout
    if (flag.rolloutPercent < 100) {
      if (!user || !user.id) {
        return false; // Anonymous users don't get rollout features
      }
      // Hash user ID to get stable percentage
      const hash = user.id.charCodeAt(0) % 100;
      return hash < flag.rolloutPercent;
    }

    return true;
  }

  getStatus() {
    return Object.entries(this.flags).map(([name, flag]) => ({
      name,
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
      betaOnly: flag.betaUsersOnly,
      reason: flag.reason
    }));
  }

  // For admins to control flags at runtime (not persisted - for testing)
  setFlag(name, enabled) {
    if (this.flags[name]) {
      this.flags[name].enabled = enabled;
    }
  }
}

module.exports = new FeatureFlagEngine();
