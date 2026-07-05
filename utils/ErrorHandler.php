<?php
/**
 * Global Error Handler
 */
class ErrorHandler {
    public static function handle(Throwable $e): void {
        $code = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
        Response::error($e->getMessage(), $code);
    }
}

// Set global exception handler
set_exception_handler([ErrorHandler::class, 'handle']);

// Set global error handler
set_error_handler(function($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});
