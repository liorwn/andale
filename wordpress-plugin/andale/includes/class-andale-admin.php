<?php
/**
 * Andale_Admin
 *
 * Registers the Settings → Andale page, saves options, and shows an admin
 * notice when the plugin is active but no Site ID has been configured.
 *
 * @package Andale
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Andale_Admin {

	/**
	 * Plugin settings.
	 *
	 * @var array
	 */
	private $settings;

	/**
	 * Slug used for the settings page.
	 *
	 * @var string
	 */
	const PAGE_SLUG = 'andale-settings';

	/**
	 * Nonce action name.
	 *
	 * @var string
	 */
	const NONCE_ACTION = 'andale_save_settings';

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
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'admin_notices', array( $this, 'maybe_show_missing_site_id_notice' ) );
		add_action( 'wp_dashboard_setup', array( $this, 'register_dashboard_widget' ) );
	}

	/**
	 * Add the settings page under the Settings menu.
	 */
	public function register_menu() {
		add_options_page(
			__( 'Andale Page Speed Optimizer', 'andale' ),
			__( 'Andale', 'andale' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Enqueue admin stylesheet only on the Andale settings page.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue_assets( $hook ) {
		if ( 'settings_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}

		wp_enqueue_style(
			'andale-admin',
			ANDALE_PLUGIN_URL . 'assets/admin.css',
			array(),
			ANDALE_VERSION
		);
	}

	/**
	 * Show a one-time admin notice when the plugin is active without a Site ID.
	 * Only shown to users who can manage options and not on the settings page itself.
	 */
	public function maybe_show_missing_site_id_notice() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Don't show on our own settings page.
		$screen = get_current_screen();
		if ( $screen && 'settings_page_' . self::PAGE_SLUG === $screen->id ) {
			return;
		}

		$site_id = isset( $this->settings['site_id'] ) ? trim( $this->settings['site_id'] ) : '';
		if ( '' !== $site_id ) {
			return;
		}

		$settings_url = admin_url( 'options-general.php?page=' . self::PAGE_SLUG );
		printf(
			'<div class="notice notice-warning is-dismissible"><p>%s</p></div>',
			wp_kses(
				sprintf(
					/* translators: %s: URL to Andale settings page */
					__( '<strong>Andale:</strong> Plugin is active but no Site ID is configured. <a href="%s">Add your Site ID →</a>', 'andale' ),
					esc_url( $settings_url )
				),
				array(
					'strong' => array(),
					'a'      => array( 'href' => array() ),
				)
			)
		);
	}

	/**
	 * Register a Dashboard widget for a quick link to the Andale dashboard.
	 */
	public function register_dashboard_widget() {
		wp_add_dashboard_widget(
			'andale_dashboard_widget',
			__( 'Andale Page Speed', 'andale' ),
			array( $this, 'render_dashboard_widget' )
		);
	}

	/**
	 * Render the Dashboard widget content.
	 */
	public function render_dashboard_widget() {
		$site_id  = isset( $this->settings['site_id'] ) ? trim( $this->settings['site_id'] ) : '';
		$dash_url = $site_id
			? 'https://andale.sh/dashboard?s=' . rawurlencode( $site_id )
			: 'https://andale.sh/install';

		?>
		<div class="andale-widget">
			<?php if ( $site_id ) : ?>
				<p class="andale-widget__status andale-widget__status--active">
					&#10003; <?php esc_html_e( 'Andale is active on this site.', 'andale' ); ?>
				</p>
				<p>
					<a href="<?php echo esc_url( $dash_url ); ?>" target="_blank" rel="noopener noreferrer" class="button button-primary">
						<?php esc_html_e( 'View Core Web Vitals Dashboard', 'andale' ); ?>
					</a>
				</p>
			<?php else : ?>
				<p class="andale-widget__status andale-widget__status--inactive">
					&#9888; <?php esc_html_e( 'No Site ID configured. Andale is not yet active.', 'andale' ); ?>
				</p>
				<p>
					<a href="<?php echo esc_url( $dash_url ); ?>" target="_blank" rel="noopener noreferrer" class="button button-primary">
						<?php esc_html_e( 'Get your free Site ID', 'andale' ); ?>
					</a>
					&nbsp;
					<a href="<?php echo esc_url( admin_url( 'options-general.php?page=' . self::PAGE_SLUG ) ); ?>" class="button">
						<?php esc_html_e( 'Settings', 'andale' ); ?>
					</a>
				</p>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Handle form submission and render the settings page.
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'andale' ) );
		}

		// Process save.
		$saved   = false;
		$errors  = array();

		if ( isset( $_POST['andale_save'] ) ) {
			$nonce = isset( $_POST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_POST['_wpnonce'] ) ) : '';

			if ( ! wp_verify_nonce( $nonce, self::NONCE_ACTION ) ) {
				$errors[] = __( 'Security check failed. Please try again.', 'andale' );
			} else {
				$new_settings = array(
					'site_id'              => sanitize_text_field( wp_unslash( isset( $_POST['andale_site_id'] ) ? $_POST['andale_site_id'] : '' ) ),
					'injection_location'   => in_array(
						isset( $_POST['andale_injection_location'] ) ? $_POST['andale_injection_location'] : '',
						array( 'head', 'footer' ),
						true
					) ? sanitize_text_field( wp_unslash( $_POST['andale_injection_location'] ) ) : 'head',
					'excluded_paths'       => sanitize_textarea_field( wp_unslash( isset( $_POST['andale_excluded_paths'] ) ? $_POST['andale_excluded_paths'] : '' ) ),
					'enabled'              => isset( $_POST['andale_enabled'] ) ? true : false,
					// Server-side optimisation.
					'server_optimize'      => isset( $_POST['andale_server_optimize'] ) ? true : false,
					'opt_defer_scripts'    => isset( $_POST['andale_opt_defer_scripts'] ) ? true : false,
					'opt_non_blocking_css' => isset( $_POST['andale_opt_non_blocking_css'] ) ? true : false,
					'opt_images'           => isset( $_POST['andale_opt_images'] ) ? true : false,
					'opt_font_display'     => isset( $_POST['andale_opt_font_display'] ) ? true : false,
					'opt_preconnect'       => isset( $_POST['andale_opt_preconnect'] ) ? true : false,
					'opt_defer_tracking'   => isset( $_POST['andale_opt_defer_tracking'] ) ? true : false,
					'opt_delay_all_js'     => isset( $_POST['andale_opt_delay_all_js'] ) ? true : false,
					'opt_critical_css'     => isset( $_POST['andale_opt_critical_css'] ) ? true : false,
					'skip_logged_in'       => isset( $_POST['andale_skip_logged_in'] ) ? true : false,
				);

				update_option( ANDALE_OPTION_KEY, $new_settings );

				// Refresh in-memory settings for the current render.
				$this->settings = $new_settings;
				$saved          = true;
			}
		}

		// Current values for rendering.
		$site_id               = isset( $this->settings['site_id'] ) ? $this->settings['site_id'] : '';
		$injection_location    = isset( $this->settings['injection_location'] ) ? $this->settings['injection_location'] : 'head';
		$excluded_paths        = isset( $this->settings['excluded_paths'] ) ? $this->settings['excluded_paths'] : '';
		$enabled               = isset( $this->settings['enabled'] ) ? (bool) $this->settings['enabled'] : true;
		// Server-side optimisation.
		$server_optimize       = isset( $this->settings['server_optimize'] ) ? (bool) $this->settings['server_optimize'] : false;
		$opt_defer_scripts     = isset( $this->settings['opt_defer_scripts'] ) ? (bool) $this->settings['opt_defer_scripts'] : true;
		$opt_non_blocking_css  = isset( $this->settings['opt_non_blocking_css'] ) ? (bool) $this->settings['opt_non_blocking_css'] : true;
		$opt_images            = isset( $this->settings['opt_images'] ) ? (bool) $this->settings['opt_images'] : true;
		$opt_font_display      = isset( $this->settings['opt_font_display'] ) ? (bool) $this->settings['opt_font_display'] : true;
		$opt_preconnect        = isset( $this->settings['opt_preconnect'] ) ? (bool) $this->settings['opt_preconnect'] : true;
		$opt_defer_tracking    = isset( $this->settings['opt_defer_tracking'] ) ? (bool) $this->settings['opt_defer_tracking'] : true;
		$opt_delay_all_js      = isset( $this->settings['opt_delay_all_js'] ) ? (bool) $this->settings['opt_delay_all_js'] : false;
		$opt_critical_css      = isset( $this->settings['opt_critical_css'] ) ? (bool) $this->settings['opt_critical_css'] : false;
		$skip_logged_in        = isset( $this->settings['skip_logged_in'] ) ? (bool) $this->settings['skip_logged_in'] : true;

		?>
		<div class="wrap andale-settings-wrap">

			<div class="andale-settings-header">
				<h1><?php esc_html_e( 'Andale Page Speed Optimizer', 'andale' ); ?></h1>
				<p class="andale-settings-header__tagline">
					<?php esc_html_e( 'Sub-1-second pages. Zero configuration.', 'andale' ); ?>
				</p>
			</div>

			<?php if ( $saved ) : ?>
				<div class="notice notice-success is-dismissible">
					<p><?php esc_html_e( 'Settings saved.', 'andale' ); ?></p>
				</div>
			<?php endif; ?>

			<?php foreach ( $errors as $error ) : ?>
				<div class="notice notice-error">
					<p><?php echo esc_html( $error ); ?></p>
				</div>
			<?php endforeach; ?>

			<div class="andale-settings-card">
				<form method="post" action="">
					<?php wp_nonce_field( self::NONCE_ACTION ); ?>

					<!-- ── Enable / Disable ─────────────────────────────────── -->
					<table class="form-table" role="presentation">
						<tr>
							<th scope="row">
								<label for="andale_enabled">
									<?php esc_html_e( 'Enable Andale', 'andale' ); ?>
								</label>
							</th>
							<td>
								<label class="andale-toggle">
									<input
										type="checkbox"
										id="andale_enabled"
										name="andale_enabled"
										value="1"
										<?php checked( $enabled, true ); ?>
									/>
									<span class="andale-toggle__label">
										<?php esc_html_e( 'Inject optimization snippet on frontend pages', 'andale' ); ?>
									</span>
								</label>
							</td>
						</tr>

						<!-- ── Site ID ──────────────────────────────────────── -->
						<tr>
							<th scope="row">
								<label for="andale_site_id">
									<?php esc_html_e( 'Site ID', 'andale' ); ?>
									<span class="andale-required" aria-hidden="true">*</span>
								</label>
							</th>
							<td>
								<div class="andale-site-id-row">
									<input
										type="text"
										id="andale_site_id"
										name="andale_site_id"
										value="<?php echo esc_attr( $site_id ); ?>"
										class="regular-text"
										placeholder="e.g. abc123xyz"
										autocomplete="off"
										spellcheck="false"
									/>
									<?php if ( $site_id ) : ?>
										<a
											href="<?php echo esc_url( 'https://andale.sh/dashboard?s=' . rawurlencode( $site_id ) ); ?>"
											target="_blank"
											rel="noopener noreferrer"
											class="button andale-verify-btn"
										>
											<?php esc_html_e( 'View Dashboard', 'andale' ); ?>
										</a>
									<?php else : ?>
										<a
											href="https://andale.sh/install"
											target="_blank"
											rel="noopener noreferrer"
											class="button andale-verify-btn"
										>
											<?php esc_html_e( 'Get Site ID', 'andale' ); ?>
										</a>
									<?php endif; ?>
								</div>
								<p class="description">
									<?php
									printf(
										/* translators: %s: link to andale.sh/install */
										esc_html__( 'Find your Site ID in the %s.', 'andale' ),
										'<a href="https://andale.sh/install" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Andale dashboard', 'andale' ) . '</a>'
									);
									?>
								</p>
							</td>
						</tr>

						<!-- ── Injection Location ────────────────────────────── -->
						<tr>
							<th scope="row">
								<?php esc_html_e( 'Injection Location', 'andale' ); ?>
							</th>
							<td>
								<fieldset>
									<legend class="screen-reader-text">
										<?php esc_html_e( 'Injection Location', 'andale' ); ?>
									</legend>
									<label class="andale-radio-label">
										<input
											type="radio"
											name="andale_injection_location"
											value="head"
											<?php checked( $injection_location, 'head' ); ?>
										/>
										<?php esc_html_e( 'Head', 'andale' ); ?>
										<span class="andale-badge andale-badge--recommended">
											<?php esc_html_e( 'recommended', 'andale' ); ?>
										</span>
										<span class="description">
											&mdash; <?php esc_html_e( 'Faster LCP; loads script as early as possible.', 'andale' ); ?>
										</span>
									</label>
									<br />
									<label class="andale-radio-label">
										<input
											type="radio"
											name="andale_injection_location"
											value="footer"
											<?php checked( $injection_location, 'footer' ); ?>
										/>
										<?php esc_html_e( 'Footer', 'andale' ); ?>
										<span class="description">
											&mdash; <?php esc_html_e( 'Use if your theme already preloads critical resources in &lt;head&gt;.', 'andale' ); ?>
										</span>
									</label>
								</fieldset>
							</td>
						</tr>

						<!-- ── Excluded Paths ────────────────────────────────── -->
						<tr>
							<th scope="row">
								<label for="andale_excluded_paths">
									<?php esc_html_e( 'Exclude Pages', 'andale' ); ?>
								</label>
							</th>
							<td>
								<textarea
									id="andale_excluded_paths"
									name="andale_excluded_paths"
									rows="5"
									class="large-text code"
									placeholder="/checkout&#10;/cart&#10;/my-account"
								><?php echo esc_textarea( $excluded_paths ); ?></textarea>
								<p class="description">
									<?php esc_html_e( 'One URL substring per line. Any page whose URL contains one of these strings will not receive the snippet. Case-sensitive.', 'andale' ); ?>
									<br />
									<em><?php esc_html_e( 'e.g. /checkout, /cart, /wp-admin', 'andale' ); ?></em>
								</p>
							</td>
						</tr>

						<!-- ── Status ────────────────────────────────────────── -->
						<tr>
							<th scope="row">
								<?php esc_html_e( 'Status', 'andale' ); ?>
							</th>
							<td>
								<?php if ( $enabled && $site_id ) : ?>
									<p class="andale-status andale-status--active">
										&#10003; <?php esc_html_e( 'Snippet is active. Andale is optimizing your pages.', 'andale' ); ?>
									</p>
									<p>
										<a href="<?php echo esc_url( 'https://andale.sh/dashboard?s=' . rawurlencode( $site_id ) ); ?>" target="_blank" rel="noopener noreferrer">
											<?php esc_html_e( 'View your Core Web Vitals report →', 'andale' ); ?>
										</a>
									</p>
								<?php elseif ( ! $site_id ) : ?>
									<p class="andale-status andale-status--inactive">
										&#9888; <?php esc_html_e( 'Waiting for Site ID. Add one above to activate Andale.', 'andale' ); ?>
									</p>
									<p>
										<a href="https://andale.sh/install" target="_blank" rel="noopener noreferrer">
											<?php esc_html_e( 'Get your free Site ID at andale.sh →', 'andale' ); ?>
										</a>
									</p>
								<?php else : ?>
									<p class="andale-status andale-status--disabled">
										&#9675; <?php esc_html_e( 'Andale is currently disabled. Enable it above to start optimizing.', 'andale' ); ?>
									</p>
								<?php endif; ?>
							</td>
						</tr>
					</table>

					<!-- ── Server-Side Optimization ─────────────────────── -->
					<hr style="margin: 24px 0;" />
					<h2 style="padding-left: 0;"><?php esc_html_e( 'Server-Side Optimization', 'andale' ); ?></h2>
					<p class="description" style="margin-bottom: 16px;">
						<?php esc_html_e( 'Directly modifies WordPress HTML output before it reaches the browser. Works without a Site ID. Fixes render-blocking scripts, non-blocking CSS, image loading, font-display, and defers tracking scripts.', 'andale' ); ?>
					</p>

					<table class="form-table" role="presentation">
						<tr>
							<th scope="row">
								<?php esc_html_e( 'Enable', 'andale' ); ?>
							</th>
							<td>
								<label class="andale-toggle">
									<input type="checkbox" name="andale_server_optimize" value="1" <?php checked( $server_optimize, true ); ?> id="andale_server_optimize" />
									<span class="andale-toggle__label">
										<?php esc_html_e( 'Enable server-side HTML optimization', 'andale' ); ?>
									</span>
								</label>
								<p class="description"><?php esc_html_e( 'Uses PHP output buffering to optimize every page before delivery.', 'andale' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Optimizations', 'andale' ); ?></th>
							<td>
								<fieldset>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_defer_scripts" value="1" <?php checked( $opt_defer_scripts, true ); ?> />
										<?php esc_html_e( 'Defer render-blocking scripts', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Adds defer attribute to non-critical JS. Saves 300–800ms.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_non_blocking_css" value="1" <?php checked( $opt_non_blocking_css, true ); ?> />
										<?php esc_html_e( 'Non-blocking CSS loading', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Converts stylesheets to async preload pattern. Eliminates render-blocking CSS.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_images" value="1" <?php checked( $opt_images, true ); ?> />
										<?php esc_html_e( 'Optimize image loading', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'lazy/eager/fetchpriority/decoding attributes on all images.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_font_display" value="1" <?php checked( $opt_font_display, true ); ?> />
										<?php esc_html_e( 'Add font-display: swap', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Prevents invisible text during font loading (FOIT).', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_critical_css" value="1" <?php checked( $opt_critical_css, true ); ?> />
										<?php esc_html_e( 'Critical CSS extraction', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Inline above-fold CSS, defer the rest. Eliminates render-blocking stylesheets.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_preconnect" value="1" <?php checked( $opt_preconnect, true ); ?> />
										<?php esc_html_e( 'Add preconnect hints', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Pre-connects to Google Fonts, jsDelivr, and other common CDNs.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_defer_tracking" value="1" <?php checked( $opt_defer_tracking, true ); ?> />
										<?php esc_html_e( 'Defer tracking scripts', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'GTM, GA, Facebook Pixel, HotJar, Amplitude + 15 others fire on first interaction. TBT drops to 0.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_opt_delay_all_js" value="1" <?php checked( $opt_delay_all_js, true ); ?> />
										<?php esc_html_e( 'Delay ALL JavaScript execution', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Like WP Rocket\'s Delay JS. Fires ALL scripts on first interaction. Drops TBT to 0ms. Test carefully — may break interactive elements.', 'andale' ); ?></span>
									</label>
									<label style="display:block;margin-bottom:8px;">
										<input type="checkbox" name="andale_skip_logged_in" value="1" <?php checked( $skip_logged_in, true ); ?> />
										<?php esc_html_e( 'Skip optimization for logged-in users', 'andale' ); ?>
										<span class="description"> &mdash; <?php esc_html_e( 'Recommended. Admins see the real page for editing.', 'andale' ); ?></span>
									</label>
								</fieldset>
							</td>
						</tr>
					</table>

					<p class="submit">
						<input
							type="submit"
							name="andale_save"
							class="button button-primary button-hero"
							value="<?php esc_attr_e( 'Save Settings', 'andale' ); ?>"
						/>
					</p>

				</form>
			</div><!-- .andale-settings-card -->

			<div class="andale-settings-footer">
				<p>
					<?php
					printf(
						/* translators: %s: link to andale.sh/install */
						esc_html__( 'Need a Site ID? Get one free at %s', 'andale' ),
						'<a href="https://andale.sh/install" target="_blank" rel="noopener noreferrer">andale.sh/install</a>'
					);
					?>
				</p>
				<p class="andale-settings-footer__version">
					<?php printf( esc_html__( 'Andale v%s', 'andale' ), esc_html( ANDALE_VERSION ) ); ?>
				</p>
			</div>

		</div><!-- .wrap -->
		<?php
	}
}
