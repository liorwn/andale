<?php
/**
 * Andale_Snippet
 *
 * Handles injecting the Andale optimization script into the page <head> or
 * <footer>, respecting per-path exclusions and the enabled toggle.
 *
 * @package Andale
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Andale_Snippet {

	/**
	 * Plugin settings.
	 *
	 * @var array
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param array $settings Plugin settings from andale_get_settings().
	 */
	public function __construct( array $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Register WordPress hooks.
	 */
	public function init() {
		// Never inject into admin pages.
		if ( is_admin() ) {
			return;
		}

		$location = isset( $this->settings['injection_location'] ) ? $this->settings['injection_location'] : 'head';

		if ( 'footer' === $location ) {
			add_action( 'wp_footer', array( $this, 'maybe_inject_snippet' ), 1 );
		} else {
			add_action( 'wp_head', array( $this, 'maybe_inject_snippet' ), 1 );
		}
	}

	/**
	 * Decide whether to inject the snippet for the current request, then do it.
	 */
	public function maybe_inject_snippet() {
		// Plugin disabled.
		if ( empty( $this->settings['enabled'] ) ) {
			return;
		}

		// No Site ID configured.
		$site_id = isset( $this->settings['site_id'] ) ? trim( $this->settings['site_id'] ) : '';
		if ( '' === $site_id ) {
			return;
		}

		// Check per-path exclusions.
		if ( $this->is_excluded() ) {
			return;
		}

		$this->inject_snippet( $site_id );
	}

	/**
	 * Output the <script> tag.
	 *
	 * @param string $site_id Sanitized site ID.
	 */
	private function inject_snippet( $site_id ) {
		// Escape for use in a URL attribute — site_id is alphanumeric but we
		// still run it through esc_attr for defence-in-depth.
		$safe_id  = esc_attr( $site_id );
		$src      = 'https://andale.sh/o.js?s=' . $safe_id;
		echo '<script src="' . esc_url( $src ) . '" async></script>' . "\n";
	}

	/**
	 * Check whether the current request path matches any exclusion pattern.
	 *
	 * Each line in `excluded_paths` is treated as a plain string prefix/substring
	 * match against the request URI (no regex, safe for untrusted input).
	 *
	 * @return bool True if the current page should be skipped.
	 */
	private function is_excluded() {
		$raw = isset( $this->settings['excluded_paths'] ) ? $this->settings['excluded_paths'] : '';
		if ( '' === trim( $raw ) ) {
			return false;
		}

		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		$lines       = array_filter( array_map( 'trim', explode( "\n", $raw ) ) );

		foreach ( $lines as $pattern ) {
			if ( '' !== $pattern && false !== strpos( $request_uri, $pattern ) ) {
				return true;
			}
		}

		return false;
	}
}
