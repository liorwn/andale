<?php
/**
 * Andale_Optimizer
 *
 * Captures WordPress HTML output via PHP output buffering and applies
 * server-side performance optimisations before the response is sent to the
 * browser.  Each optimisation stage is independent and can be toggled via
 * the plugin settings.
 *
 * @package Andale
 * @since   1.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Andale_Optimizer {

	/**
	 * Plugin settings.
	 *
	 * @var array
	 */
	private $options;

	/**
	 * Tracking-script URL patterns to defer.
	 *
	 * Keys are human-readable labels (unused at runtime); values are partial
	 * URL strings matched with strpos().
	 *
	 * @var string[]
	 */
	private static $tracking_patterns = array(
		'gtm'         => 'googletagmanager.com/gtm.js',
		'gtag'        => 'googletagmanager.com/gtag/js',
		'ga'          => 'google-analytics.com/analytics.js',
		'ga4'         => 'google-analytics.com/g/collect',
		'fbevents'    => 'connect.facebook.net/en_US/fbevents.js',
		'fb_all'      => 'connect.facebook.net/',
		'hotjar'      => 'static.hotjar.com',
		'amplitude'   => 'cdn.amplitude.com',
		'onetrust'    => 'cdn.cookielaw.org',
		'hubspot'     => 'js.hs-scripts.com',
		'segment'     => 'cdn.segment.com',
		'intercom'    => 'widget.intercom.io',
		'drift'       => 'js.driftt.com',
		'clarity'     => 'clarity.ms',
		'linkedin'    => 'snap.licdn.com',
		'twitter'     => 'static.ads-twitter.com',
		'tiktok'      => 'analytics.tiktok.com',
		'pinterest'   => 's.pinimg.com/ct/core.js',
		'reddit'      => 'www.redditstatic.com/ads',
		'quora'       => 'a.quora.com',
	);

	/**
	 * External domains that are safe to preconnect to.
	 * Tracking domains are intentionally excluded — we defer those instead.
	 *
	 * @var string[]
	 */
	private static $safe_preconnect_domains = array(
		'fonts.googleapis.com',
		'fonts.gstatic.com',
		'cdn.jsdelivr.net',
		'cdnjs.cloudflare.com',
		'use.fontawesome.com',
		'kit.fontawesome.com',
		'ajax.googleapis.com',
		'unpkg.com',
	);

	/**
	 * Constructor.
	 *
	 * @param array $options Plugin settings from andale_get_settings().
	 */
	public function __construct( array $options ) {
		$this->options = $options;
	}

	/**
	 * Register WordPress hooks.
	 */
	public function init() {
		if ( ! $this->should_optimize() ) {
			return;
		}

		add_action( 'template_redirect', array( $this, 'start_buffer' ), 0 );
		add_action( 'shutdown', array( $this, 'end_buffer' ), 0 );
	}

	/**
	 * Open the output buffer.
	 * Called on the template_redirect hook so the buffer wraps only front-end
	 * page output (not REST/AJAX responses handled earlier in the request).
	 */
	public function start_buffer() {
		ob_start( array( $this, 'optimize_html' ) );
	}

	/**
	 * Flush the output buffer on shutdown.
	 */
	public function end_buffer() {
		if ( ob_get_level() > 0 ) {
			ob_end_flush();
		}
	}

	/**
	 * Master optimisation callback — receives the full HTML string, runs all
	 * enabled stages, and returns the modified HTML.
	 *
	 * Wrapped in a try/catch equivalent: if anything goes wrong the original
	 * HTML is returned unmodified so the site never breaks.
	 *
	 * @param  string $html Raw HTML from WordPress.
	 * @return string Optimised HTML (or original on failure).
	 */
	public function optimize_html( $html ) {
		if ( empty( $html ) || ! is_string( $html ) ) {
			return $html;
		}

		// Safety: only operate on full HTML documents.
		if ( false === stripos( $html, '<html' ) ) {
			return $html;
		}

		$original = $html;

		try {
			if ( ! empty( $this->options['opt_defer_scripts'] ) ) {
				$html = $this->defer_render_blocking_scripts( $html );
			}

			if ( ! empty( $this->options['opt_non_blocking_css'] ) ) {
				$html = $this->make_css_non_blocking( $html );
			}

			if ( ! empty( $this->options['opt_images'] ) ) {
				$html = $this->optimize_images( $html );
			}

			if ( ! empty( $this->options['opt_font_display'] ) ) {
				$html = $this->add_font_display_swap( $html );
			}

			if ( ! empty( $this->options['opt_critical_css'] ) ) {
				$html = $this->extract_critical_css( $html );
			}

			if ( ! empty( $this->options['opt_preconnect'] ) ) {
				$html = $this->add_preconnect_hints( $html );
			}

			if ( ! empty( $this->options['opt_defer_tracking'] ) ) {
				$html = $this->defer_tracking_scripts( $html );
			}

			// Inject resource hints for preloaded assets.
			$html = $this->add_resource_hints( $html );

		} catch ( Exception $e ) {
			// Return original HTML unmodified on any error.
			return $original;
		}

		return $html;
	}

	// =========================================================================
	// Optimisation stages
	// =========================================================================

	/**
	 * Add the `defer` attribute to external scripts that don't already have
	 * `async` or `defer`, and are not known to break when deferred.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function defer_render_blocking_scripts( $html ) {
		$html = preg_replace_callback(
			'/<script([^>]*?)\ssrc=(["\'])([^"\']+)\2([^>]*?)>/i',
			function ( $m ) {
				$before = $m[1];
				$quote  = $m[2];
				$src    = $m[3];
				$after  = $m[4];
				$attrs  = $before . $after;

				// Already async or deferred — leave it.
				if ( preg_match( '/\b(async|defer)\b/i', $attrs ) ) {
					return $m[0];
				}

				// Already flagged as an Andale-deferred tracking script.
				if ( strpos( $attrs, 'type="text/andale-deferred"' ) !== false ||
					strpos( $attrs, "type='text/andale-deferred'" ) !== false ) {
					return $m[0];
				}

				// Skip scripts explicitly marked as critical.
				if ( preg_match( '/\bid=["\'](?:jquery-migrate|jquery-core|bootstrap)["\']/', $attrs ) ) {
					return $m[0];
				}

				// Skip inline event-handler scripts (document.write is risky when deferred).
				// Note: we can't inspect inline content here, only the tag.

				return '<script' . $before . ' src=' . $quote . $src . $quote . $after . ' defer>';
			},
			$html
		);

		return $html;
	}

	/**
	 * Convert render-blocking `<link rel="stylesheet">` tags to the preload
	 * pattern so they no longer block first paint.
	 *
	 * Critical/first stylesheet is intentionally skipped.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function make_css_non_blocking( $html ) {
		$index = 0;

		$html = preg_replace_callback(
			'/<link([^>]*?)rel=["\']stylesheet["\']([^>]*?)>/i',
			function ( $m ) use ( &$index ) {
				$before = $m[1];
				$after  = $m[2];
				$attrs  = $before . $after;

				// Extract href.
				if ( ! preg_match( '/href=["\']([^"\']+)["\']/', $attrs, $href_m ) ) {
					return $m[0];
				}
				$href = $href_m[1];

				// Skip the first stylesheet (likely the main theme CSS — critical).
				if ( 0 === $index ) {
					$index++;
					return $m[0];
				}
				$index++;

				// Skip anything labelled critical or above-fold.
				if ( preg_match( '/\bid=["\'][^"\']*(?:critical|above-fold)[^"\']*["\']/', $attrs ) ) {
					return $m[0];
				}

				// Build a clean attribute string without rel= and href=.
				$clean_attrs = preg_replace( '/\s*(?:rel|href)=["\'][^"\']*["\']/', '', $attrs );
				$clean_attrs = trim( $clean_attrs );
				$extra       = $clean_attrs ? ' ' . $clean_attrs : '';

				// Build safe escaped versions for HTML output.
				$safe_href = esc_attr( $href );

				return '<link rel="preload" href="' . $safe_href . '" as="style"' . $extra
					. ' onload="this.onload=null;this.rel=\'stylesheet\'">'
					. '<noscript><link rel="stylesheet" href="' . $safe_href . '"' . $extra . '></noscript>';
			},
			$html
		);

		return $html;
	}

	/**
	 * Optimise `<img>` tags:
	 * - Add `loading="lazy"` (except the first 3 images — likely above fold).
	 * - Add `decoding="async"` to all images.
	 * - Add `fetchpriority="high"` to the first image (LCP candidate).
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function optimize_images( $html ) {
		$img_count = 0;

		$html = preg_replace_callback(
			'/<img([^>]*?)>/i',
			function ( $m ) use ( &$img_count ) {
				$attrs = $m[1];
				$img_count++;

				// --- decoding="async" ---
				if ( ! preg_match( '/\bdecoding=["\'][^"\']*["\']/', $attrs ) ) {
					$attrs .= ' decoding="async"';
				}

				// --- fetchpriority="high" on first image (LCP) ---
				if ( 1 === $img_count && ! preg_match( '/\bfetchpriority=["\'][^"\']*["\']/', $attrs ) ) {
					$attrs .= ' fetchpriority="high"';
				}

				// --- loading attribute ---
				if ( ! preg_match( '/\bloading=["\'][^"\']*["\']/', $attrs ) ) {
					// First 3 images get eager (above fold), rest get lazy.
					$loading_val = ( $img_count <= 3 ) ? 'eager' : 'lazy';
					$attrs      .= ' loading="' . $loading_val . '"';
				}

				return '<img' . $attrs . '>';
			},
			$html
		);

		return $html;
	}

	/**
	 * Add `font-display: swap` to `@font-face` blocks inside inline `<style>`
	 * elements that are missing it.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function add_font_display_swap( $html ) {
		return preg_replace_callback(
			'/<style([^>]*)>(.*?)<\/style>/is',
			function ( $m ) {
				$tag_attrs = $m[1];
				$css       = $m[2];

				$css = preg_replace_callback(
					'/@font-face\s*\{([^}]+)\}/i',
					function ( $fm ) {
						$body = $fm[1];
						// Already has font-display — leave it.
						if ( false !== stripos( $body, 'font-display' ) ) {
							return $fm[0];
						}
						return '@font-face {' . $body . ' font-display: swap; }';
					},
					$css
				);

				return '<style' . $tag_attrs . '>' . $css . '</style>';
			},
			$html
		);
	}

	/**
	 * Scan `<script src>` and `<link href>` tags for external domains and
	 * inject `<link rel="preconnect">` hints for the top safe domains found.
	 *
	 * Tracking domains are excluded (they're deferred anyway).
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function add_preconnect_hints( $html ) {
		$found_domains = array();

		// Collect all external src/href values.
		preg_match_all(
			'/(?:src|href)=["\'](?:https?:)?\/\/([^\/\'"?#]+)/i',
			$html,
			$matches
		);

		if ( ! empty( $matches[1] ) ) {
			foreach ( $matches[1] as $domain ) {
				$domain = strtolower( trim( $domain ) );

				// Only process domains we consider safe to preconnect.
				if ( in_array( $domain, self::$safe_preconnect_domains, true ) ) {
					$found_domains[ $domain ] = true;
				}
			}
		}

		if ( empty( $found_domains ) ) {
			return $html;
		}

		// Build preconnect tags (limit to 5).
		$hints = '';
		$count = 0;
		foreach ( array_keys( $found_domains ) as $domain ) {
			if ( $count >= 5 ) {
				break;
			}
			$safe = esc_attr( $domain );
			$hints .= '<link rel="preconnect" href="https://' . $safe . '" crossorigin>' . "\n";
			$count++;
		}

		if ( ! $hints ) {
			return $html;
		}

		// Inject just before </head>.
		$html = preg_replace( '/<\/head>/i', $hints . '</head>', $html, 1 );

		return $html;
	}

	/**
	 * Inject `<link rel="preload">` hints for common resource types already
	 * referenced in the page (fonts, key scripts that have been deferred, etc.).
	 *
	 * This is intentionally lightweight — it only adds hints for resources that
	 * are already in the document, so it cannot cause broken loads.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function add_resource_hints( $html ) {
		$hints  = '';
		$added  = array();

		// Preload woff2 fonts referenced in <link href=...> tags.
		preg_match_all(
			'/<link[^>]+href=["\']([^"\']+\.woff2[^"\']*)["\'][^>]*>/i',
			$html,
			$font_matches
		);

		if ( ! empty( $font_matches[1] ) ) {
			foreach ( array_slice( $font_matches[1], 0, 3 ) as $font_url ) {
				$key = md5( $font_url );
				if ( isset( $added[ $key ] ) ) {
					continue;
				}
				$added[ $key ] = true;
				$safe          = esc_attr( $font_url );
				$hints        .= '<link rel="preload" href="' . $safe . '" as="font" type="font/woff2" crossorigin>' . "\n";
			}
		}

		if ( ! $hints ) {
			return $html;
		}

		$html = preg_replace( '/<\/head>/i', $hints . '</head>', $html, 1 );

		return $html;
	}

	/**
	 * Defer known tracking/analytics scripts to after first user interaction.
	 *
	 * Each matched `<script src="...">` is converted to
	 * `<script data-andale-src="..." type="text/andale-deferred">` so the
	 * browser never requests the URL during page load.  A small loader script
	 * (injected once before </body>) fires all deferred scripts on the first
	 * click/touch/keydown/scroll event, or after 15 seconds — whichever comes
	 * first.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function defer_tracking_scripts( $html ) {
		$deferred_any = false;

		$html = preg_replace_callback(
			'/<script([^>]*?)\ssrc=(["\'])([^"\']+)\2([^>]*?)>(\s*<\/script>)?/i',
			function ( $m ) use ( &$deferred_any ) {
				$before  = $m[1];
				$quote   = $m[2];
				$src     = $m[3];
				$after   = $m[4];
				$closing = isset( $m[5] ) ? $m[5] : '';

				// Check if this URL matches any tracking pattern.
				$is_tracking = false;
				foreach ( self::$tracking_patterns as $pattern ) {
					if ( false !== strpos( $src, $pattern ) ) {
						$is_tracking = true;
						break;
					}
				}

				if ( ! $is_tracking ) {
					return $m[0];
				}

				$deferred_any = true;

				// Strip src= from attribute string, keep everything else.
				$attrs = $before . $after;
				$attrs = preg_replace( '/\s*src=["\'][^"\']*["\']/', '', $attrs );
				$attrs = trim( $attrs );

				// Remove type= if present so we can set our own.
				$attrs = preg_replace( '/\s*type=["\'][^"\']*["\']/', '', $attrs );
				$attrs = trim( $attrs );

				$extra = $attrs ? ' ' . $attrs : '';

				$safe_src = esc_attr( $src );

				return '<script type="text/andale-deferred" data-andale-src="' . $safe_src . '"' . $extra . '></script>';
			},
			$html
		);

		// Only inject the loader if we actually deferred something.
		if ( $deferred_any ) {
			$loader = $this->get_deferred_loader_script();
			$html   = preg_replace( '/<\/body>/i', $loader . "\n</body>", $html, 1 );
		}

		return $html;
	}

	/**
	 * Return the inline JS loader that fires all deferred tracking scripts on
	 * first user interaction (or after 15 seconds).
	 *
	 * @return string HTML <script> block.
	 */
	private function get_deferred_loader_script() {
		// phpcs:disable
		return <<<'JS'
<script>
(function(){
	var fired=false;
	function loadDeferred(){
		if(fired)return;
		fired=true;
		var tags=document.querySelectorAll('script[type="text/andale-deferred"]');
		for(var i=0;i<tags.length;i++){
			var s=document.createElement('script');
			var src=tags[i].getAttribute('data-andale-src');
			if(src){
				s.src=src;
				s.async=true;
				document.head.appendChild(s);
			}
			tags[i].parentNode.removeChild(tags[i]);
		}
	}
	['click','touchstart','keydown','scroll','mousemove'].forEach(function(e){
		document.addEventListener(e,loadDeferred,{once:true,passive:true});
	});
	setTimeout(loadDeferred,15000);
})();
</script>
JS;
		// phpcs:enable
	}

	// =========================================================================
	// Critical CSS extraction
	// =========================================================================

	/**
	 * Extract above-fold critical CSS, inline it, and defer everything else.
	 *
	 * Inline <style> blocks are split into critical (selectors that match
	 * above-fold HTML) and deferred (the rest). Deferred CSS is loaded via a
	 * small window.load listener. External render-blocking <link rel="stylesheet">
	 * tags (after the first) are converted to the preload async pattern.
	 *
	 * @param  string $html HTML string.
	 * @return string Modified HTML.
	 */
	private function extract_critical_css( $html ) {
		if ( empty( $this->options['opt_critical_css'] ) ) {
			return $html;
		}

		// Get above-fold HTML approximation (first 40% of body content).
		$body_start = stripos( $html, '<body' );
		$body_end   = strripos( $html, '</body>' );
		if ( false === $body_start || false === $body_end ) {
			return $html;
		}
		$body_html     = substr( $html, $body_start, $body_end - $body_start );
		$fold_estimate = (int) ( strlen( $body_html ) * 0.4 );
		$above_fold    = substr( $body_html, 0, $fold_estimate );

		// Process each inline <style> block.
		$html = preg_replace_callback(
			'/<style([^>]*)>(.*?)<\/style>/is',
			function ( $matches ) use ( $above_fold ) {
				$attrs = $matches[1];
				$css   = $matches[2];

				// Skip tiny or non-display styles (e.g. type="text/template").
				if ( strlen( trim( $css ) ) < 100 ) {
					return $matches[0];
				}
				if ( false !== strpos( $attrs, 'text/template' ) ) {
					return $matches[0];
				}

				$rules    = $this->parse_css_rules( $css );
				$critical = array();
				$deferred = array();

				foreach ( $rules as $rule ) {
					if ( '@rule' === $rule['selector'] ) {
						// @font-face, @keyframes, @media — always critical.
						$critical[] = $rule['full'];
					} elseif ( $this->selector_matches_html( $rule['selector'], $above_fold ) ) {
						$critical[] = $rule['full'];
					} else {
						$deferred[] = $rule['full'];
					}
				}

				$output = '';
				if ( ! empty( $critical ) ) {
					$output .= '<style' . $attrs . '>' . implode( "\n", $critical ) . '</style>';
				}
				if ( ! empty( $deferred ) ) {
					$deferred_css = addslashes( implode( "\n", $deferred ) );
					$output      .= '<script>window.addEventListener("load",function(){var s=document.createElement("style");s.textContent="' . $deferred_css . '";document.head.appendChild(s);});</script>';
				}

				return $output ?: $matches[0];
			},
			$html
		);

		// Convert external render-blocking stylesheets to async preload.
		// Skip the first one — it's likely the main theme CSS (critical).
		$count = 0;
		$html  = preg_replace_callback(
			'/<link([^>]+)rel=["\']stylesheet["\']([^>]*)>/i',
			function ( $m ) use ( &$count ) {
				$count++;
				// Keep first 3 stylesheets synchronous (theme + critical plugin CSS).
				// Deferring too many causes FOUC and hurts FCP.
				if ( $count <= 3 ) {
					return $m[0];
				}
				// Extract href.
				if ( ! preg_match( '/href=["\']([^"\']+)["\']/', $m[0], $href ) ) {
					return $m[0];
				}
				$url = esc_attr( $href[1] );
				return '<link rel="preload" href="' . $url . '" as="style" onload="this.onload=null;this.rel=\'stylesheet\'">'
					. '<noscript><link rel="stylesheet" href="' . $url . '"></noscript>';
			},
			$html
		);

		return $html;
	}

	/**
	 * Parse a CSS string into an array of rule descriptors.
	 *
	 * Each descriptor has:
	 *   'selector' — the selector string (or '@rule' for at-rules)
	 *   'block'    — the block content including braces
	 *   'full'     — the complete rule text
	 *
	 * @param  string $css Raw CSS.
	 * @return array  Array of rule descriptors.
	 */
	private function parse_css_rules( $css ) {
		$rules = array();

		// Strip comments.
		$css = preg_replace( '!/\*[^*]*\*+([^/][^*]*\*+)*/!', '', $css );

		// Match at-rules with nested blocks (1 level deep: @media { ... { ... } }).
		preg_match_all( '/@[^{]+\{[^}]*(?:\{[^}]*\}[^}]*)?\}/s', $css, $at_matches );
		foreach ( $at_matches[0] as $rule ) {
			$rules[] = array(
				'selector' => '@rule',
				'block'    => $rule,
				'full'     => $rule,
			);
		}

		// Remove matched at-rules to avoid double-processing.
		$css_plain = preg_replace( '/@[^{]+\{[^}]*(?:\{[^}]*\}[^}]*)?\}/s', '', $css );

		// Match regular rules: selector { properties }.
		preg_match_all( '/([^{]+)\{([^}]*)\}/s', $css_plain, $matches, PREG_SET_ORDER );
		foreach ( $matches as $m ) {
			$selectors = explode( ',', trim( $m[1] ) );
			foreach ( $selectors as $sel ) {
				$sel     = trim( $sel );
				$rules[] = array(
					'selector' => $sel,
					'block'    => '{' . $m[2] . '}',
					'full'     => $sel . '{' . $m[2] . '}',
				);
			}
		}

		return $rules;
	}

	/**
	 * Heuristic check: does this CSS selector likely match an element in the
	 * given HTML fragment?
	 *
	 * Uses string-search heuristics — not a full CSS selector engine.
	 * When in doubt, returns true (conservative: keep as critical).
	 *
	 * @param  string $selector     CSS selector.
	 * @param  string $html_fragment Above-fold HTML.
	 * @return bool
	 */
	private function selector_matches_html( $selector, $html_fragment ) {
		$selector = trim( $selector );

		if ( '' === $selector ) {
			return true;
		}

		// Always keep at-rules, universal selector, :root, and CSS variables.
		if ( '@' === $selector[0] || '*' === $selector || false !== strpos( $selector, ':root' ) ) {
			return true;
		}

		// Simple element selector (e.g. 'h1', 'div', 'p').
		if ( preg_match( '/^[a-z][a-z0-9]*$/i', $selector ) ) {
			return false !== stripos( $html_fragment, '<' . $selector );
		}

		// Class selector (e.g. '.foo', '.bar-baz').
		if ( preg_match( '/^\.([a-z0-9_-]+)/i', $selector, $m ) ) {
			return false !== strpos( $html_fragment, 'class=' ) &&
				false !== strpos( $html_fragment, $m[1] );
		}

		// ID selector (e.g. '#header').
		if ( preg_match( '/^#([a-z0-9_-]+)/i', $selector, $m ) ) {
			return false !== strpos( $html_fragment, 'id="' . $m[1] );
		}

		// Anything else (compound, pseudo-class, attribute) — keep as critical.
		return true;
	}

	// =========================================================================
	// Guard
	// =========================================================================

	/**
	 * Determine whether server-side optimisation should run for this request.
	 *
	 * @return bool
	 */
	private function should_optimize() {
		// Skip AJAX / REST / CLI / Cron — never skip frontend.
		if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) {
			return false;
		}
		if ( defined( 'DOING_CRON' ) && DOING_CRON ) {
			return false;
		}
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			return false;
		}
		return true;
	}
}
