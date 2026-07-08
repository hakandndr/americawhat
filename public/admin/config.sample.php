<?php
/**
 * admin/config.php ÖRNEĞİ
 *
 * Bu dosyayı config.php olarak KOPYALA, değerleri doldur ve SADECE sunucuya
 * (public_html/admin/config.php) FTP ile yükle. config.php repoya GİRMEYECEK
 * (.gitignore'da) ve deploy onu EZMEYECEK (deploy.yml exclude'unda).
 */

// GitHub Personal Access Token (fine-grained, Contents: Read and write, sadece americawhat reposu)
define('GITHUB_TOKEN',  'github_pat_BURAYA_TOKEN');

define('GITHUB_OWNER',  'hakandndr');
define('GITHUB_REPO',   'americawhat');
define('GITHUB_BRANCH', 'main');

// Panele giriş şifresi (istediğini belirle)
define('PANEL_PASSWORD', 'BURAYA_GUCLU_BIR_SIFRE');
