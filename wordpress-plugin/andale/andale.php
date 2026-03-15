<?php
/**
 * Plugin Name: Andale Page Speed Optimizer
 * Plugin URI: https://andale.sh
 * Description: Automatically optimize your WordPress pages for sub-1-second loads. Defers tracking scripts, lazy-loads images, and reports Core Web Vitals to your Andale dashboard.
 * Version: 1.3.2
 * Author: Andale
 * Author URI: https://andale.sh
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: andale
 * Requires at least: 5.0
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ANDALE_VERSION', '1.3.2' );
define( 'ANDALE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANDALE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'ANDALE_OPTION_KEY', 'andale_settings' );

require_once ANDALE_PLUGIN_DIR . 'includes/class-andale-snippet.php';
require_once ANDALE_PLUGIN_DIR . 'includes/class-andale-admin.php';
require_once ANDALE_PLUGIN_DIR . 'includes/class-andale-optimizer.php';

/**
 * Returns the plugin's settings array with defaults applied.
 *
 * @return array
 */
function andale_get_settings() {
	$defaults = array(
		'site_id'              => '',
		'injection_location'   => 'head',
		'excluded_paths'       => '',
		'enabled'              => true,
		// Server-side optimisation defaults (all on except skip_logged_in).
		'server_optimize'      => true,
		'opt_defer_scripts'    => true,
		'opt_non_blocking_css' => true,
		'opt_images'           => true,
		'opt_font_display'     => true,
		'opt_preconnect'       => true,
		'opt_defer_tracking'   => true,
		'opt_delay_all_js'     => false, // Default off — powerful but may break interactive elements
		'opt_critical_css'     => false, // Default off — too aggressive for most sites
		'skip_logged_in'       => true,
	);

	$saved = get_option( ANDALE_OPTION_KEY, array() );

	return wp_parse_args( $saved, $defaults );
}

/**
 * Bootstrap: initialise the snippet injector and admin UI.
 */
function andale_init() {
	$settings = andale_get_settings();

	// Front-end snippet injection.
	$snippet = new Andale_Snippet( $settings );
	$snippet->init();

	// Server-side HTML optimisation (output buffering).
	$optimizer = new Andale_Optimizer( $settings );
	$optimizer->init();

	// Admin UI (only in wp-admin).
	if ( is_admin() ) {
		$admin = new Andale_Admin( $settings );
		$admin->init();
	}
}
add_action( 'plugins_loaded', 'andale_init' );

/**
 * On activation: set default options if not already present.
 */
function andale_activate() {
	if ( false === get_option( ANDALE_OPTION_KEY ) ) {
		add_option(
			ANDALE_OPTION_KEY,
			array(
				'site_id'            => '',
				'injection_location' => 'head',
				'excluded_paths'     => '',
				'enabled'            => true,
			)
		);
	}
}
register_activation_hook( __FILE__, 'andale_activate' );

/**
 * On deactivation: nothing to clean up (settings intentionally preserved).
 */
function andale_deactivate() {
	// Intentionally empty — settings are kept so reinstalling is seamless.
}
register_deactivation_hook( __FILE__, 'andale_deactivate' );
