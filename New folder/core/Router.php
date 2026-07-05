<?php
/**
 * Simple Router with parameter matching
 */
class Router {
    private array $routes = [];

    public function get(string $path, callable $handler): void {
        $this->addRoute('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): void {
        $this->addRoute('POST', $path, $handler);
    }

    public function put(string $path, callable $handler): void {
        $this->addRoute('PUT', $path, $handler);
    }

    public function patch(string $path, callable $handler): void {
        $this->addRoute('PATCH', $path, $handler);
    }

    public function delete(string $path, callable $handler): void {
        $this->addRoute('DELETE', $path, $handler);
    }

    private function addRoute(string $method, string $path, callable $handler): void {
        $this->routes[$method][] = [
            'path' => $path,
            'handler' => $handler,
            'pattern' => $this->convertToPattern($path)
        ];
    }

    private function convertToPattern(string $path): string {
        return '#^' . preg_replace('/\{(\w+)\}/', '(?P<$1>[^/]+)', $path) . '$#';
    }

    public function dispatch(string $uri, string $method): void {
        $uri = parse_url($uri, PHP_URL_PATH);
        $uri = str_replace('/index.php', '', $uri);

        if (!isset($this->routes[$method])) {
            Response::error('Method not allowed', 405);
        }

        foreach ($this->routes[$method] as $route) {
            if (preg_match($route['pattern'], $uri, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                $result = call_user_func_array($route['handler'], array_values($params));
                if ($result !== null) {
                    Response::success($result);
                }
                return;
            }
        }

        Response::error('Route not found: ' . $uri, 404);
    }
}
