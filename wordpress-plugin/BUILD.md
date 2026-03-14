# Building the Andale Plugin ZIP

The WordPress plugin directory expects a `.zip` where the archive root contains
a single folder named `andale/` (matching the plugin slug).

## Quick build

From this directory (`wordpress-plugin/`):

```bash
zip -r andale.zip andale/ \
  --exclude "*.DS_Store" \
  --exclude "*/__MACOSX/*" \
  --exclude "*.git*"
```

The resulting `andale.zip` can be installed via **Plugins → Add New → Upload Plugin**
in any WordPress admin.

## What goes into the ZIP

```
andale/
  andale.php
  readme.txt
  includes/
    class-andale-admin.php
    class-andale-snippet.php
  assets/
    admin.css
```

## Verifying the ZIP before distribution

```bash
# List contents to confirm structure
unzip -l andale.zip

# Expected output — all paths should start with "andale/"
#   andale/andale.php
#   andale/readme.txt
#   andale/includes/class-andale-admin.php
#   andale/includes/class-andale-snippet.php
#   andale/assets/admin.css
```

## WordPress Plugin Directory submission

1. Create an account at https://wordpress.org/plugins/developers/
2. Submit the plugin at https://wordpress.org/plugins/developers/add/
3. Upload `andale.zip` and wait for the automated checks to pass
4. Use SVN (provided by WordPress.org) for future updates — the ZIP workflow
   above is for direct installs and beta distribution only.

## Versioning

Before cutting a new release:

1. Bump `ANDALE_VERSION` in `andale/andale.php`
2. Bump `Stable tag` in `andale/readme.txt`
3. Add a new entry under `== Changelog ==` in `readme.txt`
4. Rebuild the ZIP

## CI/CD note

For automated builds (GitHub Actions, etc.):

```yaml
- name: Build plugin ZIP
  run: |
    cd wordpress-plugin
    zip -r andale.zip andale/ \
      --exclude "*.DS_Store" \
      --exclude "*/__MACOSX/*" \
      --exclude "*.git*"
    echo "ZIP size: $(du -sh andale.zip | cut -f1)"
```
