<?php
/**
 * Request Handler - Parse JSON body and query params
 */
class Request {
    private array $body = [];
    private array $query = [];

    public function __construct() {
        $this->query = $_GET;
        $input = file_get_contents('php://input');
        if (!empty($input)) {
            $this->body = json_decode($input, true) ?? [];
        }
    }

    public function body(): array {
        return $this->body;
    }

    public function get(string $key, $default = null) {
        return $this->body[$key] ?? $default;
    }

    public function query(string $key, $default = null) {
        return $this->query[$key] ?? $default;
    }

    public function all(): array {
        return $this->body;
    }

    public function has(string $key): bool {
        return isset($this->body[$key]);
    }
}
