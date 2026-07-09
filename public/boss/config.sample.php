<?php
/**
 * boss/config.php EXAMPLE
 *
 * Copy this file as config.php, fill in the values, and upload it ONLY to the
 * server (public_html/boss/config.php) via FTP. config.php must NOT enter the
 * repo (.gitignore) and the deploy must NOT overwrite it (deploy.yml exclude).
 */

// GitHub Personal Access Token (fine-grained, Contents: Read and write, americawhat repo only)
define('GITHUB_TOKEN',  'github_pat_YOUR_TOKEN');

define('GITHUB_OWNER',  'hakandndr');
define('GITHUB_REPO',   'americawhat');
define('GITHUB_BRANCH', 'main');

// Panel login credentials
define('PANEL_USER',     'YOUR_USERNAME');
define('PANEL_PASSWORD', 'YOUR_STRONG_PASSWORD');
