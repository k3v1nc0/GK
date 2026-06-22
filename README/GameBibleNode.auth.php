<?php
declare(strict_types=1);

function gkb_env(string $key, string $default = ''): string {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function gkb_request_header(string $name): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$serverKey]) ? trim((string) $_SERVER[$serverKey]) : '';
}

function gkb_same_origin(): bool {
    $allowed = gkb_env('GK_GAMEBIBLE_ALLOWED_ORIGIN', 'https://gk-k3v1nc0.duckdns.org');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    return $origin !== '' && hash_equals($allowed, $origin);
}

function gkb_session_cookie_params(): array {
    return [
        'lifetime' => 0,
        'path' => '/README/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function gkb_bootstrap_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('GBNODESESSID');
    session_set_cookie_params(gkb_session_cookie_params());
    session_start();
}

function gkb_auth_user(): string {
    return trim((string) ($_SESSION['gkb_user'] ?? ''));
}

function gkb_is_authenticated(): bool {
    return gkb_auth_user() !== '';
}

function gkb_json_response(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function gkb_read_request_body(): array {
    $contentType = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (str_contains($contentType, 'application/json')) {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    return $_POST;
}

function gkb_login_hash(): string {
    return gkb_env('GK_GAMEBIBLE_LOGIN_PASSWORD_HASH');
}

function gkb_login_rate_limit_remaining(): int {
    $lockedUntil = (int) ($_SESSION['gkb_login_locked_until'] ?? 0);
    return max(0, $lockedUntil - time());
}

function gkb_login_rate_limit_guard(): void {
    $remaining = gkb_login_rate_limit_remaining();
    if ($remaining > 0) {
        gkb_json_response(429, [
            'ok' => false,
            'loggedIn' => gkb_is_authenticated(),
            'message' => 'Probeer het later opnieuw',
            'retryAfter' => $remaining,
        ]);
    }
}

function gkb_login_record_failure(): void {
    $attempts = (int) ($_SESSION['gkb_login_attempts'] ?? 0) + 1;
    $_SESSION['gkb_login_attempts'] = $attempts;
    if ($attempts >= 5) {
        $_SESSION['gkb_login_attempts'] = 0;
        $_SESSION['gkb_login_locked_until'] = time() + 30;
    }
}

function gkb_login_clear_attempts(): void {
    unset($_SESSION['gkb_login_attempts'], $_SESSION['gkb_login_locked_until']);
}

function gkb_session_login(string $displayUser = 'Kevin/admin'): void {
    session_regenerate_id(true);
    $_SESSION['gkb_user'] = $displayUser;
    gkb_login_clear_attempts();
}

function gkb_session_logout(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 3600, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    header('Cache-Control: no-store');
    gkb_bootstrap_session();

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $action = strtolower((string) ($_REQUEST['action'] ?? 'status'));

    if ($method === 'GET' && $action === 'status') {
        gkb_json_response(200, [
            'ok' => true,
            'loggedIn' => gkb_is_authenticated(),
            'user' => gkb_is_authenticated() ? gkb_auth_user() : null,
        ]);
    }

    if ($method === 'POST' && $action === 'login') {
        if (!gkb_same_origin()) {
            gkb_json_response(403, [
                'ok' => false,
                'loggedIn' => gkb_is_authenticated(),
                'message' => 'Origin niet toegestaan',
            ]);
        }

        gkb_login_rate_limit_guard();
        $body = gkb_read_request_body();
        $password = trim((string) ($body['password'] ?? ''));
        $hash = gkb_login_hash();

        if ($hash === '' || $password === '' || !password_verify($password, $hash)) {
            gkb_login_record_failure();
            gkb_json_response(401, [
                'ok' => false,
                'loggedIn' => false,
                'message' => 'Wachtwoord onjuist',
            ]);
        }

        gkb_session_login();
        gkb_json_response(200, [
            'ok' => true,
            'loggedIn' => true,
            'user' => gkb_auth_user(),
        ]);
    }

    if ($method === 'POST' && $action === 'logout') {
        if (!gkb_same_origin()) {
            gkb_json_response(403, [
                'ok' => false,
                'loggedIn' => gkb_is_authenticated(),
                'message' => 'Origin niet toegestaan',
            ]);
        }

        gkb_session_logout();
        gkb_bootstrap_session();
        gkb_json_response(200, [
            'ok' => true,
            'loggedIn' => false,
            'user' => null,
        ]);
    }

    gkb_json_response(405, [
        'ok' => false,
        'loggedIn' => gkb_is_authenticated(),
        'message' => 'Methode niet toegestaan',
    ]);
}
