<?php
// Template for the PRIVATE DNDR relay configuration. Copy it OUTSIDE
// public_html as dndr-relay.config.php (log_df.php looks two directories above
// /analytics/, i.e. next to public_html), then fill in the values DNDR gives
// for this producer. Never commit the filled file, never place it under
// public_html, never print it.
return [
    'url' => 'https://<collector host>/relay/v1/page',
    'key_id' => '<key id registered in DNDR for this producer>',
    'secret' => '<at least 32 characters, shared only with the DNDR collector>',
    'hostname' => '<the site hostname registered in DNDR for this producer>',
    'timeout' => 2.0,
];
