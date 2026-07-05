<?php
/**
 * Departments API - Entry Point
 * RESTful API matching the Full Data Model
 */

require_once __DIR__ . '/config/Database.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Request.php';
require_once __DIR__ . '/utils/ErrorHandler.php';

// Load all controllers
require_once __DIR__ . '/controllers/DepartmentController.php';
require_once __DIR__ . '/controllers/DoctorTypeController.php';
require_once __DIR__ . '/controllers/FixedSlotController.php';
require_once __DIR__ . '/controllers/CustomSlotController.php';
require_once __DIR__ . '/controllers/SaveController.php';

// Set headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Initialize
try {
    $db = Database::getInstance()->getConnection();
    $router = new Router();
    $request = new Request();

    // ========== DEPARTMENTS ==========
    $router->get('/api/departments', function() use ($db) {
        $controller = new DepartmentController($db);
        return $controller->index();
    });

    $router->get('/api/departments/{id}', function($id) use ($db) {
        $controller = new DepartmentController($db);
        return $controller->show($id);
    });

    $router->post('/api/departments', function() use ($db) {
        $controller = new DepartmentController($db);
        return $controller->store();
    });

    $router->put('/api/departments/{id}', function($id) use ($db) {
        $controller = new DepartmentController($db);
        return $controller->update($id);
    });

    $router->delete('/api/departments/{id}', function($id) use ($db) {
        $controller = new DepartmentController($db);
        return $controller->destroy($id);
    });

    $router->patch('/api/departments/reorder', function() use ($db) {
        $controller = new DepartmentController($db);
        return $controller->reorder();
    });

    // ========== DOCTOR TYPES ==========
    $router->put('/api/departments/{id}/doctor-types', function($id) use ($db) {
        $controller = new DoctorTypeController($db);
        return $controller->update($id);
    });

    // ========== FIXED SLOTS ==========
    $router->get('/api/departments/{dept_id}/doctor-types/{type}/fixed-slots', function($dept_id, $type) use ($db) {
        $controller = new FixedSlotController($db);
        return $controller->index($dept_id, $type);
    });

    $router->post('/api/departments/{dept_id}/doctor-types/{type}/fixed-slots', function($dept_id, $type) use ($db) {
        $controller = new FixedSlotController($db);
        return $controller->store($dept_id, $type);
    });

    $router->put('/api/departments/{dept_id}/doctor-types/{type}/fixed-slots/{slot_id}', function($dept_id, $type, $slot_id) use ($db) {
        $controller = new FixedSlotController($db);
        return $controller->update($dept_id, $type, $slot_id);
    });

    $router->delete('/api/departments/{dept_id}/doctor-types/{type}/fixed-slots/{slot_id}', function($dept_id, $type, $slot_id) use ($db) {
        $controller = new FixedSlotController($db);
        return $controller->destroy($dept_id, $type, $slot_id);
    });

    $router->patch('/api/departments/{dept_id}/doctor-types/{type}/fixed-slots/reorder', function($dept_id, $type) use ($db) {
        $controller = new FixedSlotController($db);
        return $controller->reorder($dept_id, $type);
    });

    // ========== CUSTOM SLOTS ==========
    $router->get('/api/departments/{dept_id}/doctor-types/{type}/custom-slots', function($dept_id, $type) use ($db) {
        $controller = new CustomSlotController($db);
        return $controller->index($dept_id, $type);
    });

    $router->post('/api/departments/{dept_id}/doctor-types/{type}/custom-slots', function($dept_id, $type) use ($db) {
        $controller = new CustomSlotController($db);
        return $controller->store($dept_id, $type);
    });

    $router->put('/api/departments/{dept_id}/doctor-types/{type}/custom-slots/{slot_id}', function($dept_id, $type, $slot_id) use ($db) {
        $controller = new CustomSlotController($db);
        return $controller->update($dept_id, $type, $slot_id);
    });

    $router->delete('/api/departments/{dept_id}/doctor-types/{type}/custom-slots/{slot_id}', function($dept_id, $type, $slot_id) use ($db) {
        $controller = new CustomSlotController($db);
        return $controller->destroy($dept_id, $type, $slot_id);
    });

    // ========== SAVE ALL ==========
    $router->put('/api/departments/{id}/save', function($id) use ($db) {
        $controller = new SaveController($db);
        return $controller->save($id);
    });

    // Dispatch
    $router->dispatch($_SERVER['REQUEST_URI'], $_SERVER['REQUEST_METHOD']);

} catch (Exception $e) {
    ErrorHandler::handle($e);
}
