<?php
/**
 * Steel Riders Kft. – request for quotation handler.
 * Accepts the multipart form from kapcsolat.html / en/contact.html and
 * e-mails it with the uploaded drawings attached. Responds with JSON.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$cfg = require __DIR__ . '/config.php';
$en  = ($_POST['lang'] ?? 'hu') === 'en';
$t   = fn(string $hu, string $enText): string => $en ? $enText : $hu;

function reply(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function clean(string $key, int $max = 2000): string {
    $v = trim((string)($_POST[$key] ?? ''));
    $v = str_replace("\0", '', $v);
    return mb_substr($v, 0, $max);
}
function oneline(string $v): string { return trim(preg_replace('/[\r\n]+/', ' ', $v)); }
function hdr(string $v): string { return '=?UTF-8?B?' . base64_encode(oneline($v)) . '?='; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'method']);
}
// Bots: honeypot filled or form submitted implausibly fast
if (clean('website') !== '' || (int)($_POST['elapsed'] ?? 0) < 3) {
    reply(200, ['ok' => true, 'ref' => 'SR-0']);
}

$f = [
    'name'     => oneline(clean('name', 120)),
    'company'  => oneline(clean('company', 160)),
    'email'    => oneline(clean('email', 160)),
    'phone'    => oneline(clean('phone', 60)),
    'part'     => oneline(clean('part', 200)),
    'material' => oneline(clean('material', 80)),
    'tech'     => oneline(clean('tech', 80)),
    'qty'      => oneline(clean('qty', 40)),
    'message'  => clean('message', 5000),
];
$missing = [];
foreach (['name', 'company', 'email', 'message'] as $k) if ($f[$k] === '') $missing[] = $k;
if ($f['email'] !== '' && !filter_var($f['email'], FILTER_VALIDATE_EMAIL)) $missing[] = 'email';
if (empty($_POST['consent'])) $missing[] = 'consent';
if ($missing) {
    reply(422, ['ok' => false, 'error' => 'invalid', 'fields' => array_values(array_unique($missing)),
        'message' => $t('Kérjük, töltse ki a kötelező mezőket.', 'Please complete the required fields.')]);
}

// Attachments
$files = [];
if (!empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
    $total = 0;
    $n = count($_FILES['files']['name']);
    for ($i = 0; $i < $n; $i++) {
        $err = $_FILES['files']['error'][$i];
        if ($err === UPLOAD_ERR_NO_FILE) continue;
        if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['files']['tmp_name'][$i])) {
            reply(400, ['ok' => false, 'error' => 'upload', 'message' => $t('A fájl feltöltése nem sikerült.', 'File upload failed.')]);
        }
        $name = basename((string)$_FILES['files']['name'][$i]);
        $name = preg_replace('/[^\w.\- ]+/u', '_', $name) ?: 'file';
        $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, $cfg['allowed_ext'], true)) {
            reply(400, ['ok' => false, 'error' => 'type', 'message' => $t('Nem támogatott fájltípus: ', 'Unsupported file type: ') . $name]);
        }
        $total += (int)$_FILES['files']['size'][$i];
        $files[] = ['name' => $name, 'path' => $_FILES['files']['tmp_name'][$i]];
    }
    if (count($files) > $cfg['max_files'] || $total > $cfg['max_total_mb'] * 1048576) {
        reply(400, ['ok' => false, 'error' => 'size', 'message' => $t(
            "Legfeljebb {$cfg['max_files']} fájl, összesen {$cfg['max_total_mb']} MB csatolható.",
            "Up to {$cfg['max_files']} files, {$cfg['max_total_mb']} MB in total.")]);
    }
}

$ref = 'SR-' . date('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
$labels = [
    'name' => 'Név', 'company' => 'Cég', 'email' => 'E-mail', 'phone' => 'Telefon',
    'part' => 'Megnevezés / rajzszám', 'material' => 'Anyag', 'tech' => 'Technológia',
    'qty' => 'Éves mennyiség', 'message' => 'Megjegyzés',
];
$body = "Új ajánlatkérés érkezett a weboldalról.\nAzonosító: $ref\nNyelv: " . ($en ? 'EN' : 'HU') . "\n\n";
foreach ($labels as $k => $label) {
    if ($f[$k] !== '') $body .= str_pad($label . ':', 24) . $f[$k] . "\n";
}
$body .= "\nCsatolmányok: " . ($files ? implode(', ', array_column($files, 'name')) : '–') . "\n";
$body .= 'Beküldve: ' . date('Y-m-d H:i') . ', IP: ' . ($_SERVER['REMOTE_ADDR'] ?? '-') . "\n";

function send_mail(array $cfg, string $to, string $subject, string $text, string $replyTo, array $files): bool {
    $b = 'sr' . bin2hex(random_bytes(12));
    $headers = [
        'MIME-Version: 1.0',
        'From: ' . hdr($cfg['from_name']) . ' <' . $cfg['from'] . '>',
        'Reply-To: ' . $replyTo,
        "Content-Type: multipart/mixed; boundary=\"$b\"",
    ];
    $msg  = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
    $msg .= chunk_split(base64_encode($text)) . "\r\n";
    foreach ($files as $file) {
        $fn = hdr($file['name']);
        $msg .= "--$b\r\nContent-Type: application/octet-stream; name=\"$fn\"\r\n"
              . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$fn\"\r\n\r\n"
              . chunk_split(base64_encode((string)file_get_contents($file['path']))) . "\r\n";
    }
    $msg .= "--$b--\r\n";
    if ($cfg['dry_run_dir'] !== '') {
        $eml = "To: $to\r\nSubject: " . hdr($subject) . "\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . $msg;
        return (bool)file_put_contents(rtrim($cfg['dry_run_dir'], '/') . '/' . uniqid('rfq-', true) . '.eml', $eml);
    }
    return mail($to, hdr($subject), $msg, implode("\r\n", $headers), '-f' . $cfg['from']);
}

$subject = "Ajánlatkérés $ref – {$f['company']}";
if (!send_mail($cfg, $cfg['to'], $subject, $body, $f['email'], $files)) {
    reply(500, ['ok' => false, 'error' => 'mail', 'message' => $t(
        'Az üzenetet nem sikerült elküldeni. Kérjük, írjon nekünk e-mailt.',
        'The message could not be sent. Please e-mail us instead.')]);
}

if ($cfg['confirm']) {
    $confirm = $t(
        "Tisztelt {$f['name']}!\n\nKöszönjük ajánlatkérését, rögzítettük $ref azonosítóval. Kollégánk hamarosan felveszi Önnel a kapcsolatot.\n\nÜdvözlettel:\nSteel Riders Kft.\n3351 Verpelét, Kossuth út 64.\n+36 36 494 183",
        "Dear {$f['name']},\n\nThank you for your request for quotation, registered as $ref. A colleague will contact you shortly.\n\nKind regards,\nSteel Riders Kft.\nKossuth út 64, 3351 Verpelét, Hungary\n+36 36 494 183");
    send_mail($cfg, $f['email'], $t('Ajánlatkérését megkaptuk', 'We have received your request') . " – $ref", $confirm, $cfg['to'], []);
}

reply(200, ['ok' => true, 'ref' => $ref]);
