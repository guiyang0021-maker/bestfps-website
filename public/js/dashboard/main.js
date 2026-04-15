/**
 * Dashboard Entry Point
 * Bundled by esbuild for production. Loads all modules in dependency order.
 */
// Core first - provides window.api
import './core.js';
// UI layer - provides window.toast, window.showSkeleton, etc.
import './ui.js';
// Standalone modules
import './theme.js';
import './nav.js';
import './shortcuts.js';
// Account modules
import './avatar.js';
import './profile.js';
import './password.js';
import './email.js';
// Sync & data modules (depend on api + ui)
import './sync.js';
import './downloads.js';
import './presets.js';
import './shares.js';
import './stats.js';
// Content modules
import './announcements.js';
import './history.js';
import './sessions.js';
// Utility modules
import './search.js';
import './config.js';
import './activities.js';
import './versions.js';
import './onboarding.js';
// Init must be last - bootstraps everything
import './init.js';
