<?php
// Request-for-quotation endpoint settings. Edit before going live.
return [
    // Where requests are delivered
    'to'            => 'info1@steelriderskft.hu',
    // Sender address – must be a mailbox on the site's own domain (SPF/DMARC)
    'from'          => 'weboldal@steelriderskft.hu',
    'from_name'     => 'Steel Riders weboldal',
    // Send a short confirmation to the customer as well
    'confirm'       => true,
    // Attachments
    'max_files'     => 5,
    'max_total_mb'  => 20,
    'allowed_ext'   => ['pdf', 'step', 'stp', 'igs', 'iges', 'dxf', 'dwg', 'x_t', 'sldprt', 'zip', 'png', 'jpg', 'jpeg'],
    // Development: when set (env SR_MAIL_DIR), messages are written as .eml files instead of being sent
    'dry_run_dir'   => getenv('SR_MAIL_DIR') ?: '',
];
