<?php
/**
 * JSON Response Handler
 */
class Response {

    public static function success($data = null, string $message = '', int $code = 200): void {
        http_response_code($code);
        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => $data
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $code = 400, ?string $field = null): void {
        http_response_code($code);
        $response = [
            'success' => false,
            'error' => [
                'code' => self::getErrorCode($code),
                'message' => $message
            ]
        ];
        if ($field !== null) {
            $response['error']['field'] = $field;
        }
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function validationError(string $message, string $field): void {
        self::error($message, 422, $field);
    }

    public static function notFound(string $resource = 'Resource'): void {
        self::error($resource . ' not found', 404);
    }

    public static function unauthorized(): void {
        self::error('Unauthorized', 401);
    }

    private static function getErrorCode(int $httpCode): string {
        return match($httpCode) {
            400 => 'BAD_REQUEST',
            401 => 'UNAUTHORIZED',
            403 => 'FORBIDDEN',
            404 => 'NOT_FOUND',
            422 => 'VALIDATION_ERROR',
            409 => 'CONFLICT',
            500 => 'INTERNAL_ERROR',
            default => 'ERROR'
        };
    }
}
